import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { confirmOneTimePayment, createOneTimeOrder, getPlanStatus } from "@/lib/payments.functions";
import { loadRazorpayScript } from "@/lib/payments/load-razorpay-script";
import { ONE_TIME_PASS_DAYS, ONE_TIME_PRICE_INR } from "@/lib/one-time-pass";
import { formatIstDate } from "@/lib/plan-access";
import { formatINR } from "@/lib/plans";
import { Button } from "@/components/ui/button";

/**
 * "Generate One Time with INR 300": for people without a plan. Pays once, then
 * returns to the Content Calendar where the current week's content can be
 * generated one time (no autoposting).
 */
export function OneTimeGenerate() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const { data: status } = useQuery({
    queryKey: ["plan-status"],
    queryFn: () => getPlanStatus(),
  });

  const pass = status?.oneTime ?? null;

  async function pay() {
    setBusy(true);
    try {
      await loadRazorpayScript();
      const order = await createOneTimeOrder();
      const checkout = new window.Razorpay({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amountPaise,
        currency: order.currency,
        name: "LOVIZA",
        description: "One-time content generation · current week",
        prefill: { name: order.customerName, email: order.customerEmail },
        theme: { color: "#00a8c6" },
        handler: async (response) => {
          try {
            await confirmOneTimePayment({
              data: {
                razorpayOrderId: response.razorpay_order_id ?? order.orderId,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              },
            });
            await queryClient.invalidateQueries();
            toast.success("Payment received. You can now generate this week's content.");
          } catch (err) {
            // Paid on Razorpay's side; the webhook will still unlock it.
            console.error("[one-time] confirm failed", err);
            toast.info(
              "Payment received. We're unlocking your generation; it can take a few seconds.",
            );
          } finally {
            setBusy(false);
            navigate({ to: "/calendar" });
          }
        },
        modal: { ondismiss: () => setBusy(false) },
      });
      checkout.open();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start the payment");
      setBusy(false);
    }
  }

  if (pass && !pass.used) {
    return (
      <div className="mt-6 rounded-xl border border-border bg-muted/40 p-4 text-sm">
        <p className="font-medium">Your one-time generation is ready.</p>
        <p className="mt-1 text-muted-foreground">
          Open the Content Calendar and press Generate Content. Valid until{" "}
          {formatIstDate(pass.expiresAt)}.
        </p>
        <Button className="mt-3" asChild>
          <Link to="/calendar">Go to Content Calendar</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-xl border border-border bg-muted/40 p-4 text-sm">
      <p className="font-medium">Just need this week's content?</p>
      <p className="mt-1 text-muted-foreground">
        Pay {formatINR(ONE_TIME_PRICE_INR)} once to generate the current week's content one time. No
        subscription, no autoposting; you post it yourself within {ONE_TIME_PASS_DAYS} days.
      </p>
      <Button className="mt-3" onClick={pay} disabled={busy || !status}>
        {busy ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="mr-2 h-4 w-4" />
        )}
        Generate One Time with {formatINR(ONE_TIME_PRICE_INR)}
      </Button>
    </div>
  );
}
