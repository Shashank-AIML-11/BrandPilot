import { untyped } from "@/lib/untyped-db.server";

/**
 * Auto-renew on top of the prepaid plan periods. Server-only.
 *
 * Every automatic charge Razorpay makes is turned into a plan_orders row with the
 * order id "auto_<payment id>" and applied through apply_plan_payment(), the same
 * function that handles one-time payments. That gives idempotency (the browser
 * confirm and the webhook can both run), stacking on a running plan, plan switches
 * and profiles.plan for free.
 */

/** Subscription states that still own a live Razorpay mandate. */
export const LIVE_AUTORENEW = ["created", "authenticated", "active", "pending"] as const;

export interface AutorenewRow {
  id: string;
  user_id: string;
  razorpay_subscription_id: string;
  plan: string;
  billing_cycle: "monthly" | "annual";
  period_days: number;
  amount_paise: number;
  status: string;
  starts_at: string | null;
  last_payment_id: string | null;
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function findAutorenew(razorpaySubscriptionId: string): Promise<AutorenewRow | null> {
  const db = await admin();
  const { data, error } = await untyped(db)
    .from("autorenew_subscriptions")
    .select("*")
    .eq("razorpay_subscription_id", razorpaySubscriptionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as AutorenewRow | null) ?? null;
}

/**
 * Adds one paid period for an automatic charge. Safe to call twice for the same
 * payment: the second call changes nothing.
 */
export async function applyAutorenewCharge(
  razorpaySubscriptionId: string,
  paymentId: string,
): Promise<{ applied: boolean; plan: string; periodEnd: string } | null> {
  const row = await findAutorenew(razorpaySubscriptionId);
  if (!row) return null;
  const db = await admin();

  // Same plan as the customer's latest paid plan = renewal; anything else = a switch.
  const { data: last, error: lastError } = await db
    .from("subscriptions")
    .select("plan")
    .eq("user_id", row.user_id)
    .in("status", ["active", "expired"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastError) throw new Error(lastError.message);
  const kind: "new" | "renew" = last && last.plan === row.plan ? "renew" : "new";

  const orderId = `auto_${paymentId}`;
  const { error: orderError } = await untyped(db)
    .from("plan_orders")
    .upsert(
      {
        razorpay_order_id: orderId,
        user_id: row.user_id,
        plan: row.plan,
        kind,
        amount_paise: row.amount_paise,
        currency: "INR",
        billing_cycle: row.billing_cycle,
        period_days: row.period_days,
      },
      { onConflict: "razorpay_order_id", ignoreDuplicates: true },
    );
  if (orderError) throw new Error(orderError.message);

  const { applyPlanPayment } = await import("@/lib/payments/apply-payment.server");
  const result = await applyPlanPayment(orderId, paymentId);

  // Mark the period row so the app gives a few days of grace while the next charge is on its way.
  await untyped(db)
    .from("subscriptions")
    .update({ auto_renew: true })
    .eq("user_id", row.user_id)
    .eq("status", "active")
    .eq("plan", row.plan);

  await untyped(db)
    .from("autorenew_subscriptions")
    .update({
      status: "active",
      last_payment_id: paymentId,
      failure_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq("razorpay_subscription_id", razorpaySubscriptionId);

  return { applied: result.applied, plan: result.plan, periodEnd: result.periodEnd };
}

/**
 * Handles a Razorpay "subscription.*" webhook for an auto-renew subscription.
 * Returns false when the subscription is not one of ours (the caller then
 * falls through to the older handling).
 */
export async function handleAutorenewEvent(params: {
  event: string;
  razorpaySubscriptionId: string;
  paymentId?: string | undefined;
  paymentError?: string | undefined;
}): Promise<boolean> {
  const row = await findAutorenew(params.razorpaySubscriptionId);
  if (!row) return false;
  const db = await admin();
  const now = new Date().toISOString();

  const setStatus = async (status: string, extra: Record<string, unknown> = {}) => {
    await untyped(db)
      .from("autorenew_subscriptions")
      .update({ status, updated_at: now, ...extra })
      .eq("razorpay_subscription_id", params.razorpaySubscriptionId);
  };

  switch (params.event) {
    case "subscription.authenticated":
      if (row.status === "created") await setStatus("authenticated");
      break;
    case "subscription.activated":
      await setStatus("active");
      break;
    case "subscription.charged":
      if (params.paymentId) {
        await applyAutorenewCharge(params.razorpaySubscriptionId, params.paymentId);
      }
      break;
    case "subscription.pending":
      await setStatus("pending", params.paymentError ? { failure_reason: params.paymentError } : {});
      break;
    case "subscription.halted":
    case "subscription.cancelled":
    case "subscription.completed": {
      const status = params.event.replace("subscription.", "");
      await setStatus(status, { cancelled_at: now });
      // No more automatic charges: the plan simply runs to the end of the period already paid.
      await untyped(db)
        .from("subscriptions")
        .update({ auto_renew: false })
        .eq("user_id", row.user_id)
        .eq("status", "active");
      break;
    }
    default:
      break;
  }
  return true;
}

/**
 * Cancels every live auto-renew subscription of a customer on Razorpay and in
 * our table. Used by the OFF toggle and when the customer switches plans.
 */
export async function cancelAutorenewForUser(userId: string): Promise<number> {
  const db = await admin();
  const { data, error } = await untyped(db)
    .from("autorenew_subscriptions")
    .select("razorpay_subscription_id, status")
    .eq("user_id", userId)
    .in("status", [...LIVE_AUTORENEW]);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<{ razorpay_subscription_id: string; status: string }>;
  if (rows.length === 0) return 0;

  const razorpay = await import("@/lib/payments/razorpay.server");
  const now = new Date().toISOString();
  for (const r of rows) {
    try {
      await razorpay.cancelAutorenewSubscription(r.razorpay_subscription_id, r.status === "active");
    } catch (err) {
      // Already cancelled on Razorpay's side is fine; anything else is logged for follow-up.
      console.error(`[autorenew] could not cancel ${r.razorpay_subscription_id}`, err);
    }
    await untyped(db)
      .from("autorenew_subscriptions")
      .update({ status: "cancelled", cancelled_at: now, updated_at: now })
      .eq("razorpay_subscription_id", r.razorpay_subscription_id);
  }
  await untyped(db)
    .from("subscriptions")
    .update({ auto_renew: false })
    .eq("user_id", userId)
    .eq("status", "active");
  return rows.length;
}
