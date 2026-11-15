import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  parseBillingCycle,
  periodDaysFor,
  planById,
  planTotalInr,
  PLANS,
  type BillingCycle,
} from "@/lib/plans";
import {
  daysUntilExpiry,
  isPeriodActive,
  LEGACY_AUTOPAY_GRACE_DAYS,
  nextPeriodEnd,
  REMINDER_DAYS,
} from "@/lib/plan-access";

/**
 * Plans are prepaid 30-day periods paid through Razorpay Orders:
 *   - createPlanOrder    -> opens a payment for one period
 *   - confirmPlanPayment -> verifies it and adds the 30 days
 *   - getPlanStatus      -> what the app shows (days left, expired, ...)
 * The Razorpay webhook also applies paid orders (idempotently), so a user who
 * closes the tab right after paying still gets their plan.
 */

// ---------------------------------------------------------------------------
// createPlanOrder
// ---------------------------------------------------------------------------

const orderInput = z.object({
  planId: z.enum(["starter", "growth", "scale"]),
  /** Optional referral code. Checked on the server; the amount is never taken from the browser. */
  referralCode: z.string().max(64).optional(),
  /** Monthly = 30 days, annual = 12 months paid up front for 365 days. Defaults to monthly. */
  billingCycle: z.enum(["monthly", "annual"]).optional(),
});

export const createPlanOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => orderInput.parse(input))
  .handler(async ({ data, context }) => {
    const plan = PLANS.find((p) => p.id === data.planId);
    if (!plan) throw new Error("Unknown plan");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { untyped } = await import("@/lib/untyped-db.server");

    // The most recent plan this user paid for (running or lapsed).
    const { data: lastSub, error: subError } = await supabaseAdmin
      .from("subscriptions")
      .select("id, plan, status, current_period_end, razorpay_subscription_id, billing_period")
      .eq("user_id", context.userId)
      .in("status", ["active", "expired"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (subError) throw new Error(subError.message);

    // Same plan as the last one = renewal (extends it). Anything else = a new
    // plan that starts a fresh 30 days from today.
    const kind: "new" | "renew" = lastSub && lastSub.plan === plan.id ? "renew" : "new";

    const { data: profile, error: profileError } = await context.supabase
      .from("profiles")
      .select("email, full_name")
      .eq("id", context.userId)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);

    // The JWT's email claim is authoritative; fall back to it when the
    // profiles row has a blank email.
    const claimsEmail =
      typeof context.claims === "object" && context.claims && "email" in context.claims
        ? (context.claims as { email?: unknown }).email
        : undefined;
    const email = profile?.email || (typeof claimsEmail === "string" ? claimsEmail : "");
    if (!email) throw new Error("Your account is missing an email address.");
    if (!profile?.email) {
      await supabaseAdmin
        .from("profiles")
        .update({ email } as never)
        .eq("id", context.userId);
    }

    // Referral discount: first plan only, validated here against the database.
    const billingCycle: BillingCycle = data.billingCycle ?? "monthly";
    const periodDays = periodDaysFor(billingCycle);
    const listAmountPaise = planTotalInr(plan, billingCycle) * 100;
    let amountPaise = listAmountPaise;
    let discountPercent = 0;
    let referralId: string | null = null;
    if (data.referralCode?.trim()) {
      const { checkReferralForUser } = await import("@/lib/referrals.server");
      const { discountedPaise } = await import("@/lib/referrals.shared");
      const check = await checkReferralForUser(data.referralCode, { id: context.userId, email });
      if (!check.ok) throw new Error(check.reason);
      discountPercent = check.referral.discount_percent;
      referralId = check.referral.id;
      amountPaise = discountedPaise(listAmountPaise, discountPercent);
    }

    const razorpay = await import("@/lib/payments/razorpay.server");
    const order = await razorpay.createOrder({
      amountPaise,
      receipt: `lv_${context.userId.slice(0, 8)}_${Date.now()}`,
      notes: {
        userId: context.userId,
        planId: plan.id,
        kind,
        billingCycle,
        ...(referralId ? { referralId, discountPercent: String(discountPercent) } : {}),
      },
    });

    const { error: insertError } = await untyped(supabaseAdmin)
      .from("plan_orders")
      .insert({
        razorpay_order_id: order.id,
        user_id: context.userId,
        plan: plan.id,
        kind,
        amount_paise: amountPaise,
        currency: "INR",
        // Annual orders carry their length; monthly ones leave these columns at
        // their defaults (monthly, 30 days), so they never depend on that migration.
        ...(billingCycle === "annual" ? { billing_cycle: "annual", period_days: periodDays } : {}),
        // Only touch the referral columns when a referral is actually used, so
        // a normal purchase never depends on the referral migration.
        ...(referralId
          ? {
              list_amount_paise: listAmountPaise,
              discount_percent: discountPercent,
              referral_code_id: referralId,
            }
          : {}),
      });
    if (insertError) throw new Error(insertError.message);

    // Preview of the new expiry, shown before the customer pays.
    const running =
      kind === "renew" && lastSub?.current_period_end ? lastSub.current_period_end : null;
    const newPeriodEnd = nextPeriodEnd(running, new Date(), periodDays).toISOString();

    return {
      orderId: order.id,
      amountPaise,
      listAmountPaise,
      discountPercent,
      currency: "INR" as const,
      keyId: razorpay.publicKeyId(),
      planName: plan.name,
      kind,
      billingCycle,
      newPeriodEnd,
      customerEmail: email,
      customerName: profile?.full_name ?? undefined,
    };
  });

// ---------------------------------------------------------------------------
// confirmPlanPayment
// ---------------------------------------------------------------------------

const confirmInput = z.object({
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
});

/**
 * Called from the Razorpay Checkout success handler for instant feedback.
 * Verifies the payment signature, then adds the 30 days. The webhook does the
 * same idempotently if this call is skipped.
 */
export const confirmPlanPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => confirmInput.parse(input))
  .handler(async ({ data, context }) => {
    const razorpay = await import("@/lib/payments/razorpay.server");
    const valid = razorpay.verifyOrderPaymentSignature({
      razorpayOrderId: data.razorpayOrderId,
      razorpayPaymentId: data.razorpayPaymentId,
      razorpaySignature: data.razorpaySignature,
    });
    if (!valid) throw new Error("Payment verification failed.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { untyped } = await import("@/lib/untyped-db.server");

    const { data: order, error: orderError } = await untyped(supabaseAdmin)
      .from("plan_orders")
      .select("user_id")
      .eq("razorpay_order_id", data.razorpayOrderId)
      .maybeSingle();
    if (orderError) throw new Error(orderError.message);
    if (!order || order.user_id !== context.userId) {
      throw new Error("Order not found for this user.");
    }

    const { applyPlanPayment } = await import("@/lib/payments/apply-payment.server");
    const result = await applyPlanPayment(data.razorpayOrderId, data.razorpayPaymentId);

    return {
      status: "active" as const,
      plan: result.plan,
      kind: result.kind,
      periodEnd: result.periodEnd,
    };
  });

// ---------------------------------------------------------------------------
// getPlanStatus
// ---------------------------------------------------------------------------

export type PlanState = "none" | "active" | "expiring" | "expired";

export interface PlanStatus {
  state: PlanState;
  /** The owner account never loses features; it can still renew like anyone else. */
  isRoot: boolean;
  plan: string | null;
  planName: string | null;
  priceInr: number | null;
  /** The billing cycle of the plan they paid for last (monthly unless they bought annual). */
  billingCycle: BillingCycle;
  periodEnd: string | null;
  /** Whole IST days until expiry (0 = expires today, negative = already expired). */
  daysLeft: number | null;
  /** Expiry date if the customer renews right now. */
  renewedUntil: string | null;
}

const NO_PLAN: PlanStatus = {
  state: "none",
  isRoot: false,
  plan: null,
  planName: null,
  priceInr: null,
  billingCycle: "monthly",
  periodEnd: null,
  daysLeft: null,
  renewedUntil: null,
};

/**
 * Current plan state for the signed-in user. If a plan has run past its end
 * date, this also marks it expired right away, so the app does not have to
 * wait for the daily job to notice.
 */
export const getPlanStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PlanStatus> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ROOT_EMAIL } = await import("@/lib/generation-entitlements");

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("id", context.userId)
      .maybeSingle();
    const isRoot = profile?.email?.trim().toLowerCase() === ROOT_EMAIL;

    const { data: sub, error } = await supabaseAdmin
      .from("subscriptions")
      .select("id, plan, status, current_period_end, razorpay_subscription_id")
      .eq("user_id", context.userId)
      .in("status", ["active", "expired"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!sub) return { ...NO_PLAN, isRoot };

    const plan = planById(sub.plan);
    if (!plan) return { ...NO_PLAN, isRoot };

    const now = new Date();
    const grace = sub.razorpay_subscription_id ? LEGACY_AUTOPAY_GRACE_DAYS : 0;
    const lapsed = sub.status === "expired" || !isPeriodActive(sub.current_period_end, now, grace);

    if (lapsed && sub.status === "active") {
      await supabaseAdmin
        .from("subscriptions")
        .update({ status: "expired", expired_at: now.toISOString() } as never)
        .eq("id", sub.id)
        .eq("status", "active");
      await supabaseAdmin
        .from("profiles")
        .update({ plan: "free" } as never)
        .eq("id", context.userId);
    }

    const cycle = parseBillingCycle((sub as { billing_period?: string | null }).billing_period);
    const periodEnd = sub.current_period_end;
    const daysLeft = periodEnd ? daysUntilExpiry(periodEnd, now) : null;
    const state: PlanState = lapsed
      ? "expired"
      : daysLeft !== null && daysLeft <= REMINDER_DAYS
        ? "expiring"
        : "active";

    return {
      state,
      isRoot,
      plan: plan.id,
      planName: plan.name,
      priceInr: planTotalInr(plan, cycle),
      billingCycle: cycle,
      periodEnd,
      daysLeft,
      renewedUntil: nextPeriodEnd(
        lapsed ? null : periodEnd,
        now,
        periodDaysFor(cycle),
      ).toISOString(),
    };
  });
