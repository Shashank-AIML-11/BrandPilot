import { untyped } from "@/lib/untyped-db.server";

export interface AppliedPayment {
  applied: boolean;
  plan: string;
  kind: "new" | "renew";
  periodStart: string;
  periodEnd: string;
}

/**
 * Turns a paid Razorpay order into plan time (atomic + idempotent, see
 * public.apply_plan_payment). Called by the browser's confirm step AND by the
 * Razorpay webhook; whichever arrives first does the work, the other is a no-op.
 * Also cancels any old autopay subscription so the customer is never charged
 * twice. Server-only.
 */
export async function applyPlanPayment(
  orderId: string,
  paymentId: string,
): Promise<AppliedPayment> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await untyped(supabaseAdmin).rpc("apply_plan_payment", {
    p_order_id: orderId,
    p_payment_id: paymentId,
  });
  if (error) throw new Error(error.message);

  const r = data as {
    applied: boolean;
    plan: string;
    kind: "new" | "renew";
    period_start: string;
    period_end: string;
    cancel_razorpay_subscriptions?: string[];
  };

  if (r.applied && r.cancel_razorpay_subscriptions?.length) {
    const razorpay = await import("@/lib/payments/razorpay.server");
    for (const id of r.cancel_razorpay_subscriptions) {
      try {
        await razorpay.cancelSubscription(id);
      } catch (err) {
        // Already cancelled on Razorpay's side is fine; anything else is logged for follow-up.
        console.error(`[payments] could not cancel old autopay subscription ${id}`, err);
      }
    }
  }

  return {
    applied: r.applied,
    plan: r.plan,
    kind: r.kind,
    periodStart: r.period_start,
    periodEnd: r.period_end,
  };
}
