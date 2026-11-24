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

  // A one-time payment that SWITCHES plan ends the old plan's auto-renew, otherwise it would
  // keep charging for the plan the customer just left. (Automatic charges are "auto_..." orders.)
  if (r.applied && r.kind === "new" && !orderId.startsWith("auto_")) {
    try {
      const { data: owner } = await untyped(supabaseAdmin)
        .from("plan_orders")
        .select("user_id")
        .eq("razorpay_order_id", orderId)
        .maybeSingle();
      const userId = (owner as { user_id?: string } | null)?.user_id;
      if (userId) {
        const { cancelAutorenewForUser } = await import("@/lib/payments/autorenew.server");
        await cancelAutorenewForUser(userId);
      }
    } catch (err) {
      console.error("[payments] could not stop auto-renew after a plan switch", err);
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
