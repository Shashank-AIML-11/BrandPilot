import type { BillingCycle, PlanId } from "@/lib/plans";
import { confirmAutorenew, startAutorenew } from "@/lib/autorenew.functions";
import { loadRazorpayScript } from "@/lib/payments/load-razorpay-script";

export interface AutorenewOutcome {
  planName: string;
  /** true = the customer already has a running plan, so the first charge happens on firstChargeAt. */
  scheduled: boolean;
  firstChargeAt: string | null;
  periodEnd: string | null;
}

/**
 * Opens Razorpay Checkout so the customer approves auto-renew (UPI AutoPay or a card
 * standing instruction) once. Resolves with the result, or null if the window was
 * closed without approving. Rejects if something went wrong.
 */
export async function runAutorenewCheckout(
  planId: PlanId,
  cycle: BillingCycle,
): Promise<AutorenewOutcome | null> {
  await loadRazorpayScript();
  const s = await startAutorenew({ data: { planId, billingCycle: cycle } });

  return new Promise<AutorenewOutcome | null>((resolve, reject) => {
    const checkout = new window.Razorpay({
      key: s.keyId,
      subscription_id: s.subscriptionId,
      name: "LOVIZA",
      description: `${s.planName} plan · auto-renews ${cycle === "annual" ? "every year" : "every month"}`,
      prefill: { name: s.customerName, email: s.customerEmail },
      theme: { color: "#00a8c6" },
      handler: async (response) => {
        try {
          const r = await confirmAutorenew({
            data: {
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySubscriptionId: response.razorpay_subscription_id ?? s.subscriptionId,
              razorpaySignature: response.razorpay_signature,
            },
          });
          resolve({
            planName: s.planName,
            scheduled: r.scheduled,
            firstChargeAt: r.firstChargeAt,
            periodEnd: r.periodEnd,
          });
        } catch (err) {
          reject(err);
        }
      },
      modal: { ondismiss: () => resolve(null) },
    });
    checkout.open();
  });
}
