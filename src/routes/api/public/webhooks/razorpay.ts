import { createFileRoute } from "@tanstack/react-router";

// Configure this exact URL in the Razorpay dashboard under
// Settings → Webhooks, e.g.:
//   https://<your-domain>/api/public/webhooks/razorpay
// Select at least these events: subscription.activated,
// subscription.charged, subscription.cancelled, subscription.halted,
// subscription.completed, subscription.pending, payment.failed

interface RazorpayWebhookPayload {
  event: string;
  payload: {
    subscription?: { entity?: { id?: string; status?: string; current_end?: number } };
    payment?: {
      entity?: {
        id?: string;
        order_id?: string;
        subscription_id?: string;
        error_description?: string;
      };
    };
    order?: { entity?: { id?: string } };
  };
}

// Maps Razorpay subscription status onto our own status column. Kept
// as a passthrough with a couple of renames for consistency with the
// rest of the app (e.g. "active" instead of Razorpay's "authenticated"
// once a charge has actually gone through).
function statusForEvent(event: string, razorpayStatus?: string): string | null {
  switch (event) {
    case "subscription.activated":
    case "subscription.charged":
      return "active";
    case "subscription.pending":
      return "pending";
    case "subscription.halted":
      return "halted";
    case "subscription.cancelled":
      return "cancelled";
    case "subscription.completed":
      return "completed";
    default:
      return razorpayStatus ?? null;
  }
}

export const Route = createFileRoute("/api/public/webhooks/razorpay")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // IMPORTANT: read the raw body for signature verification
        // before any JSON parsing — re-serializing parsed JSON does
        // not reliably reproduce the exact bytes Razorpay signed.
        const rawBody = await request.text();
        const signature = request.headers.get("x-razorpay-signature");

        const { verifyWebhookSignature } = await import("@/lib/payments/razorpay.server");
        if (!verifyWebhookSignature(rawBody, signature)) {
          console.error("[webhook:razorpay] invalid signature");
          return new Response("Invalid signature", { status: 400 });
        }

        let body: RazorpayWebhookPayload;
        try {
          body = JSON.parse(rawBody);
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const subscriptionEntity = body.payload.subscription?.entity;
        const paymentEntity = body.payload.payment?.entity;

        // Prepaid 30-day plans: a paid Razorpay Order adds 30 days to the plan.
        // Also enable the "payment.captured" (or "order.paid") event on this
        // webhook in the Razorpay dashboard. Payments that belong to old autopay
        // subscriptions have an order id we don't know, so they fall through to
        // the subscription handling below unchanged.
        if (body.event === "payment.captured" || body.event === "order.paid") {
          const orderId = paymentEntity?.order_id ?? body.payload.order?.entity?.id;
          const paymentId = paymentEntity?.id;
          if (orderId && paymentId) {
            const { supabaseAdmin: adminDb } =
              await import("@/integrations/supabase/client.server");
            const { untyped } = await import("@/lib/untyped-db.server");
            const { data: ourOrder } = await untyped(adminDb)
              .from("plan_orders")
              .select("razorpay_order_id")
              .eq("razorpay_order_id", orderId)
              .maybeSingle();
            if (ourOrder) {
              try {
                const { applyPlanPayment } = await import("@/lib/payments/apply-payment.server");
                await applyPlanPayment(orderId, paymentId);
                return new Response("ok", { status: 200 });
              } catch (err) {
                console.error("[webhook:razorpay] applying plan payment failed", err);
                // 500 makes Razorpay retry later.
                return new Response("Apply failed", { status: 500 });
              }
            }
            // One-time "generate this week" pass (INR 500).
            const { data: ourPass } = await untyped(adminDb)
              .from("one_time_passes")
              .select("razorpay_order_id")
              .eq("razorpay_order_id", orderId)
              .maybeSingle();
            if (ourPass) {
              try {
                const { applyOneTimePayment } = await import("@/lib/one-time-pass.server");
                await applyOneTimePayment(orderId, paymentId);
                return new Response("ok", { status: 200 });
              } catch (err) {
                console.error("[webhook:razorpay] applying one-time payment failed", err);
                return new Response("Apply failed", { status: 500 });
              }
            }
          }
        }
        const razorpaySubscriptionId = subscriptionEntity?.id ?? paymentEntity?.subscription_id;

        // Auto-renew subscriptions (UPI AutoPay / card standing instruction) are handled
        // separately; each automatic charge is applied as a paid plan period.
        if (razorpaySubscriptionId && body.event.startsWith("subscription.")) {
          try {
            const { handleAutorenewEvent } = await import("@/lib/payments/autorenew.server");
            const handled = await handleAutorenewEvent({
              event: body.event,
              razorpaySubscriptionId,
              paymentId: paymentEntity?.id,
              paymentError: paymentEntity?.error_description,
            });
            if (handled) return new Response("ok", { status: 200 });
          } catch (err) {
            console.error("[webhook:razorpay] auto-renew handling failed", err);
            // 500 makes Razorpay retry later.
            return new Response("Auto-renew failed", { status: 500 });
          }
        }

        if (!razorpaySubscriptionId) {
          // Not every webhook event is subscription-related (e.g.
          // one-off payment events without a subscription). Nothing
          // for us to do — acknowledge so Razorpay doesn't retry.
          return new Response("ok", { status: 200 });
        }

        const nextStatus = statusForEvent(body.event, subscriptionEntity?.status);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: sub, error: findError } = await supabaseAdmin
          .from("subscriptions")
          .select("user_id, plan, status")
          .eq("razorpay_subscription_id", razorpaySubscriptionId)
          .maybeSingle();

        if (findError) {
          console.error("[webhook:razorpay] lookup failed", findError.message);
          return new Response("Lookup failed", { status: 500 });
        }

        if (!sub) {
          // Subscription created directly in Razorpay dashboard, or a
          // race where the webhook arrived before our own insert.
          // Acknowledge — nothing actionable on our side yet.
          console.warn(`[webhook:razorpay] unknown subscription ${razorpaySubscriptionId}`);
          return new Response("ok", { status: 200 });
        }

        const updates: Record<string, unknown> = {};
        if (nextStatus) updates["status"] = nextStatus;
        if (subscriptionEntity?.current_end) {
          updates["current_period_end"] = new Date(
            subscriptionEntity.current_end * 1000,
          ).toISOString();
        }
        if (body.event === "subscription.cancelled") {
          updates["cancelled_at"] = new Date().toISOString();
        }
        if (body.event === "payment.failed" && paymentEntity?.error_description) {
          updates["failure_reason"] = paymentEntity.error_description;
        }
        if (paymentEntity?.id) {
          updates["last_payment_id"] = paymentEntity.id;
        }

        if (Object.keys(updates).length > 0) {
          const { error: updateError } = await supabaseAdmin
            .from("subscriptions")
            .update(updates as never)
            .eq("razorpay_subscription_id", razorpaySubscriptionId);
          if (updateError) {
            console.error("[webhook:razorpay] update failed", updateError.message);
            return new Response("Update failed", { status: 500 });
          }
        }

        // Keep profiles.plan in sync with the active subscription so
        // the rest of the app (feature gating, limits) reads a single
        // source of truth without joining subscriptions every time.
        if (nextStatus === "active") {
          await supabaseAdmin
            .from("profiles")
            .update({ plan: sub.plan } as never)
            .eq("id", sub.user_id);
        } else if (
          nextStatus === "cancelled" ||
          nextStatus === "halted" ||
          nextStatus === "completed"
        ) {
          // Only fall back to "free" if the user has no other live plan. A plan
          // switch cancels the old autopay subscription; that late "cancelled"
          // event must not wipe the plan the customer just paid for.
          const { data: stillLive } = await supabaseAdmin
            .from("subscriptions")
            .select("id")
            .eq("user_id", sub.user_id)
            .eq("status", "active")
            .neq("razorpay_subscription_id", razorpaySubscriptionId)
            .limit(1);
          if (!stillLive?.length) {
            await supabaseAdmin
              .from("profiles")
              .update({ plan: "free" } as never)
              .eq("id", sub.user_id);
          }
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
