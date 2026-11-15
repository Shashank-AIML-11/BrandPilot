import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarClock, Check, Loader2, Lock } from "lucide-react";
import {
  formatINR,
  parseBillingCycle,
  periodDaysFor,
  planById,
  planPerMonthInr,
  planTotalInr,
  type BillingCycle,
} from "@/lib/plans";
import { BillingToggle } from "@/components/billing-toggle";
import { formatIstDate, formatIstDateTime, nextPeriodEnd } from "@/lib/plan-access";
import { confirmPlanPayment, createPlanOrder, getPlanStatus } from "@/lib/payments.functions";
import { loadRazorpayScript } from "@/lib/payments/load-razorpay-script";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/renew")({
  head: () => ({
    meta: [
      { title: "Renew your plan — LOVIZA" },
      { name: "description", content: "Renew your LOVIZA plan for another 30 days." },
    ],
  }),
  component: RenewPage,
});

function RenewPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const { data: status, isLoading } = useQuery({
    queryKey: ["plan-status"],
    queryFn: () => getPlanStatus(),
  });

  // Renew for the same period as last time (monthly or annual); the customer can switch here.
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  useEffect(() => {
    if (status) setCycle(parseBillingCycle(status.billingCycle));
  }, [status]);

  async function renew() {
    if (!status?.plan) return;
    setBusy(true);
    try {
      await loadRazorpayScript();
      const order = await createPlanOrder({
        data: { planId: status.plan as "starter" | "growth" | "scale", billingCycle: cycle },
      });

      const checkout = new window.Razorpay({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amountPaise,
        currency: order.currency,
        name: "LOVIZA",
        description: `${order.planName} plan · ${cycle === "annual" ? "1 year" : "30 days"}`,
        prefill: { name: order.customerName, email: order.customerEmail },
        theme: { color: "#00a8c6" },
        handler: async (response) => {
          try {
            const result = await confirmPlanPayment({
              data: {
                razorpayOrderId: response.razorpay_order_id ?? order.orderId,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              },
            });
            await queryClient.invalidateQueries();
            toast.success(`Plan renewed. Active until ${formatIstDate(result.periodEnd)}.`);
            navigate({ to: "/plan" });
          } catch (err) {
            // The payment went through on Razorpay's side; the webhook will still add the days.
            console.error("[renew] confirm failed", err);
            toast.info(
              "Payment received. We're finishing the renewal; refresh your plan page in a few seconds.",
            );
            navigate({ to: "/plan" });
          } finally {
            setBusy(false);
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

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const plan = planById(status?.plan);
  if (!status || status.state === "none" || !plan) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <h1 className="text-2xl font-bold">Renew your plan</h1>
        <p className="text-sm text-muted-foreground">
          You don't have a plan to renew yet. Choose a plan to get started.
        </p>
        <Button asChild>
          <Link to="/pricing">See plans</Link>
        </Button>
      </div>
    );
  }

  const totalInr = planTotalInr(plan, cycle);
  const newEnd = nextPeriodEnd(
    status.state === "expired" ? null : status.periodEnd,
    new Date(),
    periodDaysFor(cycle),
  );
  const expired = status.state === "expired";
  const left = status.daysLeft ?? 0;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Renew your plan</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pay for another {cycle === "annual" ? "year" : "30 days"} of your {plan.name} plan.
        </p>
        <BillingToggle value={cycle} onChange={setCycle} className="mt-4" />
      </div>

      <section className="surface p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Current plan</p>
            <h2 className="mt-1 font-display text-2xl font-bold">{plan.name}</h2>
          </div>
          <Badge variant={expired ? "destructive" : "secondary"}>
            {expired
              ? "Expired"
              : left <= 0
                ? "Ends today"
                : `${left} ${left === 1 ? "day" : "days"} left`}
          </Badge>
        </div>

        <div className="mt-5 flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-4 text-sm">
          <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div className="space-y-1">
            <p>
              {expired ? "Ended on " : "Ends on "}
              <strong>{status.periodEnd ? formatIstDateTime(status.periodEnd) : "-"}</strong>
            </p>
            <p className="text-muted-foreground">
              {expired
                ? "Content generation and posting are paused until you renew. Your brand profile and content are safe."
                : `Renew now and the ${cycle === "annual" ? "year" : "30 days"} is added after your current end date, so you don't lose any days.`}
            </p>
          </div>
        </div>

        <ul className="mt-5 space-y-2 text-sm">
          <li className="flex items-center justify-between">
            <span className="text-muted-foreground">
              {plan.name} · {cycle === "annual" ? "1 year" : "30 days"}
            </span>
            <span className="font-medium">{formatINR(totalInr)}</span>
          </li>
          {cycle === "annual" && (
            <li className="text-xs text-primary">
              {formatINR(planPerMonthInr(plan, "annual"))}/month, billed once a year (40% off
              monthly).
            </li>
          )}
          <li className="flex items-center justify-between">
            <span className="text-muted-foreground">New end date</span>
            <span className="flex items-center gap-1.5 font-medium">
              <Check className="h-4 w-4 text-primary" />
              {formatIstDate(newEnd)}
            </span>
          </li>
          <li className="flex items-center justify-between border-t border-border pt-3 font-display text-lg font-semibold">
            <span>Total due</span>
            <span>{formatINR(totalInr)}</span>
          </li>
        </ul>

        <Button className="mt-6 w-full" onClick={renew} disabled={busy}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Renew for {formatINR(totalInr)}
        </Button>
        <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5" />
          Card, UPI, netbanking and wallets via Razorpay. Your card details never touch our servers.
        </p>
      </section>

      <p className="text-sm text-muted-foreground">
        Want a different plan?{" "}
        <Link to="/pricing" className="text-primary underline underline-offset-4">
          Change plan
        </Link>{" "}
        (a new plan starts a fresh period from the day you pay).
      </p>
    </div>
  );
}
