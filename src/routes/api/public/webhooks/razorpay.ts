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
        subscription_id?: string;
        error_description?: string;
      };
    };
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
        const razorpaySubscriptionId = subscriptionEntity?.id ?? paymentEntity?.subscription_id;

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
          updates["current_period_end"] = new Date(subscriptionEntity.current_end * 1000).toISOString();
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
        } else if (nextStatus === "cancelled" || nextStatus === "halted" || nextStatus === "completed") {
          await supabaseAdmin
            .from("profiles")
            .update({ plan: "free" } as never)
            .eq("id", sub.user_id);
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
