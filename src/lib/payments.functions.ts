import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { PLANS, type PlanId } from "@/lib/plans";

const createInput = z.object({
  planId: z.enum(["starter", "growth", "scale"]),
});

/**
 * Creates (or reuses) a Razorpay customer + subscription for the
 * current user, records a "created" row in public.subscriptions, and
 * returns what the client needs to open Razorpay Checkout. The
 * subscription only becomes "active" once Razorpay confirms payment —
 * that transition happens in the webhook, never here.
 */
export const createRazorpaySubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createInput.parse(input))
  .handler(async ({ data, context }) => {
    const plan = PLANS.find((p) => p.id === data.planId);
    if (!plan) throw new Error("Unknown plan");

    const { data: profile, error: profileError } = await context.supabase
      .from("profiles")
      .select("email, full_name")
      .eq("id", context.userId)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);
    if (!profile?.email) throw new Error("Your account is missing an email address.");

    const razorpay = await import("@/lib/payments/razorpay.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const customer = await razorpay.ensureCustomer({
      email: profile.email,
      name: profile.full_name,
    });

    const subscription = await razorpay.createSubscription({
      planId: plan.id as PlanId,
      customerId: customer.id,
      userId: context.userId,
    });

    // Upsert on razorpay_subscription_id so retrying a failed checkout
    // doesn't create duplicate rows.
    const { error: upsertError } = await supabaseAdmin
      .from("subscriptions")
      .upsert(
        {
          user_id: context.userId,
          plan: plan.id,
          price_cents: plan.priceMonthly * 100,
          billing_period: "monthly",
          payment_method: "razorpay",
          status: "created",
          currency: "INR",
          razorpay_subscription_id: subscription.id,
          razorpay_customer_id: customer.id,
        } as never,
        { onConflict: "razorpay_subscription_id" },
      );
    if (upsertError) throw new Error(upsertError.message);

    return {
      subscriptionId: subscription.id,
      keyId: razorpay.publicKeyId(),
      planName: plan.name,
      customerEmail: profile.email,
      customerName: profile.full_name ?? undefined,
    };
  });

const confirmInput = z.object({
  razorpayPaymentId: z.string().min(1),
  razorpaySubscriptionId: z.string().min(1),
  razorpaySignature: z.string().min(1),
});

/**
 * Called from the client's Razorpay Checkout success handler for fast
 * UI feedback. Verifies the payment signature and, if valid,
 * optimistically marks the subscription active. The webhook
 * (subscription.activated / subscription.charged) is idempotent and
 * remains the authoritative source of truth if this call is skipped
 * (e.g. the user closes the tab right after paying).
 */
export const confirmRazorpayPayment = createServerFn({ method: "POST" })
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

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: sub, error: subError } = await supabaseAdmin
      .from("subscriptions")
      .select("user_id, plan")
      .eq("razorpay_subscription_id", data.razorpaySubscriptionId)
      .maybeSingle();
    if (subError) throw new Error(subError.message);
    if (!sub || sub.user_id !== context.userId) {
      throw new Error("Subscription not found for this user.");
    }

    const { error: updateError } = await supabaseAdmin
      .from("subscriptions")
      .update({
        status: "active",
        last_payment_id: data.razorpayPaymentId,
      } as never)
      .eq("razorpay_subscription_id", data.razorpaySubscriptionId);
    if (updateError) throw new Error(updateError.message);

    const { error: planError } = await supabaseAdmin
      .from("profiles")
      .update({ plan: sub.plan } as never)
      .eq("id", context.userId);
    if (planError) throw new Error(planError.message);

    return { status: "active" as const };
  });
