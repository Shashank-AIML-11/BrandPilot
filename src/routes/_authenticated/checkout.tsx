import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Check, Loader2, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatINR, planById, PLANS, type PlanId } from "@/lib/plans";
import { createRazorpaySubscription, confirmRazorpayPayment } from "@/lib/payments.functions";
import { loadRazorpayScript } from "@/lib/payments/load-razorpay-script";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export const Route = createFileRoute("/_authenticated/checkout")({
  head: () => ({
    meta: [
      { title: "Checkout — LOVIZA" },
      { name: "description", content: "Confirm your LOVIZA plan and complete payment." },
      { property: "og:title", content: "Checkout — LOVIZA" },
      { property: "og:description", content: "Confirm your LOVIZA plan and complete payment." },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    plan: (typeof search["plan"] === "string" ? search["plan"] : "growth") as PlanId,
  }),
  component: CheckoutPage,
});

function CheckoutPage() {
  const { plan: planParam } = useSearch({ from: "/_authenticated/checkout" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [busy, setBusy] = useState(false);

  // The plan the user is currently subscribed to (if any). Same query
  // pricing.tsx uses, so it's served from cache when arriving via a
  // "Switch to X" link.
  const { data: currentPlanId, isLoading: loadingCurrentPlan } = useQuery({
    queryKey: ["current-plan-id"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return null;
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("plan")
        .eq("user_id", userData.user.id)
        .in("status", ["pending", "active"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (sub?.plan as PlanId | undefined) ?? null;
    },
  });

  const currentPlan = currentPlanId ? planById(currentPlanId) : null;

  // Plans the user could switch to — everything except the one they're
  // already on. If they're not subscribed yet, every plan is selectable.
  const switchablePlans = PLANS.filter((p) => p.id !== currentPlanId);

  // Which plan is selected in the radio group. Defaults to whichever
  // plan they clicked "Switch to" on, falling back to the first
  // switchable plan if that ever isn't valid (e.g. it turned out to be
  // their current plan).
  const [selectedPlanId, setSelectedPlanId] = useState<PlanId | null>(null);

  useEffect(() => {
    if (loadingCurrentPlan) return;
    setSelectedPlanId((prev) => {
      if (prev && switchablePlans.some((p) => p.id === prev)) return prev;
      const preferred = planParam !== currentPlanId ? planById(planParam) : null;
      return (preferred ?? switchablePlans[0])?.id ?? null;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingCurrentPlan, currentPlanId]);

  const plan = selectedPlanId ? planById(selectedPlanId) : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!plan) return;
    setBusy(true);
    try {
      await loadRazorpayScript();

      const { subscriptionId, keyId, planName, customerEmail, customerName } =
        await createRazorpaySubscription({ data: { planId: plan.id } });

      const checkout = new window.Razorpay({
        key: keyId,
        subscription_id: subscriptionId,
        name: "LOVIZA",
        description: `${planName} plan · monthly`,
        prefill: { name: customerName, email: customerEmail },
        theme: { color: "#6d28d9" },
        handler: async (response) => {
          try {
            await confirmRazorpayPayment({
              data: {
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySubscriptionId: response.razorpay_subscription_id,
                razorpaySignature: response.razorpay_signature,
              },
            });
            queryClient.invalidateQueries();
            toast.success(`${planName} plan activated. Welcome aboard!`);
            navigate({ to: "/plan" });
          } catch (err) {
            // Payment succeeded on Razorpay's side even if this
            // confirmation call fails — the webhook will still
            // activate the subscription shortly. Let the user know
            // rather than implying the payment itself failed.
            toast.info(
              "Payment received — finishing setup. This can take a few seconds; refresh the plan page shortly.",
            );
            console.error("[checkout] confirm failed", err);
            navigate({ to: "/plan" });
          } finally {
            setBusy(false);
          }
        },
        modal: {
          ondismiss: () => setBusy(false),
        },
      });

      checkout.open();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start checkout");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Complete your subscription</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {currentPlan
              ? "Pick the plan you'd like to switch to, then complete payment securely via Razorpay."
              : "Choose your plan, then complete payment securely via Razorpay."}
          </p>
        </div>
        <Button type="button" variant="ghost" onClick={() => navigate({ to: "/pricing" })}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Plans
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          {currentPlan && (
            <section className="surface p-5">
              <h2 className="text-sm font-semibold">Current plan</h2>
              <div className="mt-4 rounded-xl border border-border bg-muted/40 p-4">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 font-medium">
                    {currentPlan.name}
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold">
                      Active
                    </span>
                  </span>
                  <span className="font-display font-semibold">
                    {formatINR(currentPlan.priceMonthly)}/mo
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{currentPlan.tagline}</p>
              </div>
            </section>
          )}

          <section className="surface p-5">
            <h2 className="text-sm font-semibold">
              {currentPlan ? "Switch to" : "Plan"}
            </h2>

            {loadingCurrentPlan ? (
              <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading your plan…
              </div>
            ) : (
              <RadioGroup
                className="mt-4 space-y-3"
                value={selectedPlanId ?? undefined}
                onValueChange={(value) => setSelectedPlanId(value as PlanId)}
              >
                {switchablePlans.map((p) => {
                  const selected = selectedPlanId === p.id;
                  return (
                    <Label
                      key={p.id}
                      htmlFor={`plan-${p.id}`}
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${
                        selected ? "border-primary bg-accent/40" : "border-border"
                      }`}
                    >
                      <RadioGroupItem value={p.id} id={`plan-${p.id}`} className="mt-1" />
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{p.name}</span>
                          <span className="font-display font-semibold">
                            {formatINR(p.priceMonthly)}/mo
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{p.tagline}</p>
                      </div>
                    </Label>
                  );
                })}
              </RadioGroup>
            )}
          </section>

          <section className="surface p-5">
            <h2 className="text-sm font-semibold">Payment</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Card, UPI, netbanking, and wallets are all available in the next step — Razorpay's
              secure checkout lets you pick your preferred method there.
            </p>
            <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
              <Lock className="h-3.5 w-3.5" />
              Payments are processed securely by Razorpay. Your card details never touch our
              servers.
            </p>
          </section>
        </div>

        <aside className="surface h-fit p-5">
          <h2 className="text-sm font-semibold">Order summary</h2>
          {plan ? (
            <>
              <div className="mt-4 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{plan.name} · monthly</span>
                <span className="font-medium">{formatINR(plan.priceMonthly)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Taxes</span>
                <span className="text-muted-foreground">Calculated at checkout</span>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-border pt-4 font-display text-lg font-semibold">
                <span>Total due</span>
                <span>{formatINR(plan.priceMonthly)}</span>
              </div>
              <ul className="mt-5 space-y-2 text-sm">
                {plan.features.slice(0, 4).map((f) => (
                  <li key={f} className="flex gap-2 text-muted-foreground">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    {f}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">Select a plan to continue.</p>
          )}
          <Label htmlFor="submit" className="sr-only">
            Submit
          </Label>
          <Button id="submit" type="submit" className="mt-6 w-full" disabled={busy || !plan}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Continue to payment
          </Button>
        </aside>
      </div>
    </form>
  );
}
