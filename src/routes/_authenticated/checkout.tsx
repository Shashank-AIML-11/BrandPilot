import { useState } from "react";
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Loader2, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PAYMENT_METHODS, PLANS, planById, type PlanId } from "@/lib/plans";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export const Route = createFileRoute("/_authenticated/checkout")({
  head: () => ({
    meta: [
      { title: "Checkout — Kontenta" },
      { name: "description", content: "Confirm your Kontenta plan and payment method." },
      { property: "og:title", content: "Checkout — Kontenta" },
      { property: "og:description", content: "Confirm your Kontenta plan and payment method." },
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

  const [planId, setPlanId] = useState<PlanId>(planById(planParam)?.id ?? "growth");
  const [method, setMethod] = useState(PAYMENT_METHODS[0]!.id);
  const [busy, setBusy] = useState(false);

  const plan = planById(planId)!;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user!.id;

      const { error: subError } = await supabase.from("subscriptions").insert({
        user_id: userId,
        plan: plan.id,
        price_cents: plan.priceMonthly * 100,
        billing_period: "monthly",
        payment_method: method,
        status: "pending",
      });
      if (subError) throw subError;

      const { error: profileError } = await supabase
        .from("profiles")
        .update({ plan: plan.id })
        .eq("id", userId);
      if (profileError) throw profileError;

      queryClient.invalidateQueries();
      toast.success(`${plan.name} plan selected. Payment collection goes live once the gateway is connected.`);
      navigate({ to: "/plan" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not complete subscription");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Complete your subscription</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose your plan and preferred payment method, then submit.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <section className="surface p-5">
            <h2 className="text-sm font-semibold">Plan</h2>
            <RadioGroup
              value={planId}
              onValueChange={(v) => setPlanId(v as PlanId)}
              className="mt-4 space-y-3"
            >
              {PLANS.map((p) => (
                <label
                  key={p.id}
                  className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-4 transition-colors hover:bg-accent has-[:checked]:border-primary"
                >
                  <RadioGroupItem value={p.id} className="mt-1" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{p.name}</span>
                      <span className="font-display font-semibold">${p.priceMonthly}/mo</span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{p.tagline}</p>
                  </div>
                </label>
              ))}
            </RadioGroup>
          </section>

          <section className="surface p-5">
            <h2 className="text-sm font-semibold">Payment method</h2>
            <RadioGroup value={method} onValueChange={setMethod} className="mt-4 grid gap-3 sm:grid-cols-2">
              {PAYMENT_METHODS.map((m) => (
                <label
                  key={m.id}
                  className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-4 transition-colors hover:bg-accent has-[:checked]:border-primary"
                >
                  <RadioGroupItem value={m.id} className="mt-1" />
                  <div>
                    <p className="text-sm font-medium">{m.label}</p>
                    <p className="text-xs text-muted-foreground">{m.hint}</p>
                  </div>
                </label>
              ))}
            </RadioGroup>
            <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
              <Lock className="h-3.5 w-3.5" />
              The payment gateway is not connected yet — submitting records your plan and marks the
              subscription as pending.
            </p>
          </section>
        </div>

        <aside className="surface h-fit p-5">
          <h2 className="text-sm font-semibold">Order summary</h2>
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{plan.name} · monthly</span>
            <span className="font-medium">${plan.priceMonthly}.00</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Taxes</span>
            <span className="text-muted-foreground">Calculated at gateway</span>
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-border pt-4 font-display text-lg font-semibold">
            <span>Total due</span>
            <span>${plan.priceMonthly}.00</span>
          </div>
          <ul className="mt-5 space-y-2 text-sm">
            {plan.features.slice(0, 4).map((f) => (
              <li key={f} className="flex gap-2 text-muted-foreground">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                {f}
              </li>
            ))}
          </ul>
          <Label htmlFor="submit" className="sr-only">
            Submit
          </Label>
          <Button id="submit" type="submit" className="mt-6 w-full" disabled={busy}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit
          </Button>
        </aside>
      </div>
    </form>
  );
}
