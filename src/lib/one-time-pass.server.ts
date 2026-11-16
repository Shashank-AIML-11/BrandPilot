import { untyped } from "@/lib/untyped-db.server";

export interface AppliedOneTime {
  applied: boolean;
  expiresAt: string;
}

/**
 * Marks a paid one-time order as paid (atomic + idempotent, see
 * public.apply_one_time_pass). Called by the browser's confirm step AND the
 * Razorpay webhook. Server-only.
 */
export async function applyOneTimePayment(
  orderId: string,
  paymentId: string,
): Promise<AppliedOneTime> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await untyped(supabaseAdmin).rpc("apply_one_time_pass", {
    p_order_id: orderId,
    p_payment_id: paymentId,
  });
  if (error) throw new Error(error.message);
  const r = data as { applied: boolean; expires_at: string };
  return { applied: r.applied, expiresAt: r.expires_at };
}
