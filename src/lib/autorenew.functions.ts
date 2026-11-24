import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { periodDaysFor, planById, planTotalInr, type BillingCycle } from "@/lib/plans";

/**
 * Auto-renew: the customer approves a Razorpay subscription once (UPI AutoPay or
 * a card standing instruction) and every period is then charged automatically.
 *
 *   - getAutorenewStatus -> what the ON/OFF toggle shows
 *   - startAutorenew     -> creates the Razorpay subscription for the checkout window
 *   - confirmAutorenew   -> verifies the browser result; applies the first charge if it was immediate
 *   - cancelAutorenew    -> the OFF toggle: stops future charges, the paid period keeps running
 *
 * Later charges arrive through the Razorpay webhook (subscription.charged).
 * Banks do not allow automatic debits above about INR 15,000 without the
 * customer approving each charge; Razorpay then asks the customer to approve it.
 */

const HOUR_MS = 3_600_000;

export interface AutorenewStatus {
  enabled: boolean;
  /** authenticated | active | pending (halted / cancelled / completed count as OFF) */
  status: string | null;
  plan: string | null;
  billingCycle: BillingCycle | null;
  amountInr: number | null;
  /** When the next automatic charge is due, if known. */
  nextChargeAt: string | null;
  failureReason: string | null;
}

const NONE: AutorenewStatus = {
  enabled: false,
  status: null,
  plan: null,
  billingCycle: null,
  amountInr: null,
  nextChargeAt: null,
  failureReason: null,
};

export const getAutorenewStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AutorenewStatus> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { untyped } = await import("@/lib/untyped-db.server");

    const { data, error } = await untyped(supabaseAdmin)
      .from("autorenew_subscriptions")
      .select("plan, billing_cycle, amount_paise, status, starts_at, failure_reason")
      .eq("user_id", context.userId)
      // "created" = the checkout window was opened but the mandate was never approved: not ON yet.
      .in("status", ["authenticated", "active", "pending"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NONE;

    const row = data as {
      plan: string;
      billing_cycle: BillingCycle;
      amount_paise: number;
      status: string;
      starts_at: string | null;
      failure_reason: string | null;
    };

    // The next charge is the end of the paid period the customer already has.
    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select("current_period_end")
      .eq("user_id", context.userId)
      .in("status", ["active", "expired"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      enabled: true,
      status: row.status,
      plan: row.plan,
      billingCycle: row.billing_cycle,
      amountInr: Math.round(row.amount_paise / 100),
      nextChargeAt: row.starts_at ?? sub?.current_period_end ?? null,
      failureReason: row.failure_reason,
    };
  });

const startInput = z.object({
  planId: z.enum(["starter", "growth", "scale"]),
  billingCycle: z.enum(["monthly", "annual"]).optional(),
});

export const startAutorenew = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => startInput.parse(input))
  .handler(async ({ data, context }) => {
    const plan = planById(data.planId);
    if (!plan) throw new Error("Unknown plan");
    const cycle: BillingCycle = data.billingCycle ?? "monthly";
    const amountPaise = planTotalInr(plan, cycle) * 100;
    const periodDays = periodDaysFor(cycle);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { untyped } = await import("@/lib/untyped-db.server");

    const { data: profile, error: profileError } = await context.supabase
      .from("profiles")
      .select("email, full_name")
      .eq("id", context.userId)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);
    const claimsEmail =
      typeof context.claims === "object" && context.claims && "email" in context.claims
        ? (context.claims as { email?: unknown }).email
        : undefined;
    const email = profile?.email || (typeof claimsEmail === "string" ? claimsEmail : "");
    if (!email) throw new Error("Your account is missing an email address.");

    // A customer with a running paid period is charged when that period ends, so no days
    // are lost and nobody pays twice; a new or lapsed customer is charged right away.
    const { data: lastSub, error: subError } = await supabaseAdmin
      .from("subscriptions")
      .select("status, current_period_end")
      .eq("user_id", context.userId)
      .in("status", ["active", "expired"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (subError) throw new Error(subError.message);
    const endMs = lastSub?.current_period_end ? new Date(lastSub.current_period_end).getTime() : 0;
    const running = lastSub?.status === "active" && endMs > Date.now() + HOUR_MS;
    const startsAt = running ? new Date(endMs) : null;

    // One live mandate per customer: stop any earlier one before creating the new one.
    const { cancelAutorenewForUser } = await import("@/lib/payments/autorenew.server");
    await cancelAutorenewForUser(context.userId);

    const razorpay = await import("@/lib/payments/razorpay.server");
    const sub = await razorpay.createAutorenewSubscription({
      planId: plan.id,
      cycle,
      userId: context.userId,
      ...(startsAt ? { startAt: Math.floor(startsAt.getTime() / 1000) } : {}),
    });

    const { error: insertError } = await untyped(supabaseAdmin)
      .from("autorenew_subscriptions")
      .insert({
        user_id: context.userId,
        razorpay_subscription_id: sub.id,
        plan: plan.id,
        billing_cycle: cycle,
        period_days: periodDays,
        amount_paise: amountPaise,
        status: "created",
        starts_at: startsAt ? startsAt.toISOString() : null,
      });
    if (insertError) throw new Error(insertError.message);

    return {
      subscriptionId: sub.id,
      keyId: razorpay.publicKeyId(),
      amountPaise,
      planName: plan.name,
      billingCycle: cycle,
      /** null = the first charge happens now; otherwise the date it will happen. */
      firstChargeAt: startsAt ? startsAt.toISOString() : null,
      customerEmail: email,
      customerName: profile?.full_name ?? undefined,
    };
  });

const confirmInput = z.object({
  razorpayPaymentId: z.string().min(1),
  razorpaySubscriptionId: z.string().min(1),
  razorpaySignature: z.string().min(1),
});

export const confirmAutorenew = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => confirmInput.parse(input))
  .handler(async ({ data, context }) => {
    const razorpay = await import("@/lib/payments/razorpay.server");
    const valid = razorpay.verifyPaymentSignature({
      razorpayPaymentId: data.razorpayPaymentId,
      razorpaySubscriptionId: data.razorpaySubscriptionId,
      razorpaySignature: data.razorpaySignature,
    });
    if (!valid) throw new Error("Payment verification failed.");

    const { findAutorenew } = await import("@/lib/payments/autorenew.server");
    const row = await findAutorenew(data.razorpaySubscriptionId);
    if (!row || row.user_id !== context.userId) throw new Error("Auto-renew not found for this user.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { untyped } = await import("@/lib/untyped-db.server");

    // Delayed start: this payment only authorised the mandate, so it adds no days.
    // The charge itself arrives at the start date through the webhook.
    if (row.starts_at) {
      await untyped(supabaseAdmin)
        .from("autorenew_subscriptions")
        .update({ status: "authenticated", updated_at: new Date().toISOString() })
        .eq("razorpay_subscription_id", data.razorpaySubscriptionId)
        .eq("status", "created");
      return { scheduled: true as const, firstChargeAt: row.starts_at, plan: row.plan, periodEnd: null };
    }

    const { applyAutorenewCharge } = await import("@/lib/payments/autorenew.server");
    const result = await applyAutorenewCharge(data.razorpaySubscriptionId, data.razorpayPaymentId);
    return {
      scheduled: false as const,
      firstChargeAt: null,
      plan: result?.plan ?? row.plan,
      periodEnd: result?.periodEnd ?? null,
    };
  });

export const cancelAutorenew = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { cancelAutorenewForUser } = await import("@/lib/payments/autorenew.server");
    const stopped = await cancelAutorenewForUser(context.userId);
    return { stopped };
  });
