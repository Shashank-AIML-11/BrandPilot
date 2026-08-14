import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatINR, PLANS } from "@/lib/plans";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — Kontenta" },
      {
        name: "description",
        content:
          "Three simple Kontenta plans: Starter, Growth and Scale. Daily AI marketing content for every brand you run.",
      },
      { property: "og:title", content: "Pricing — Kontenta" },
      {
        property: "og:description",
        content: "Starter, Growth and Scale plans for AI-generated marketing content.",
      },
    ],
  }),
  component: PricingPage,
});

function PricingPage() {
  const { data: session } = useQuery({
    queryKey: ["session-check"],
    queryFn: async () => (await supabase.auth.getSession()).data.session,
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link to="/" className="font-display text-lg font-bold">
          Kontenta<span className="text-primary">.</span>
        </Link>
        <Button variant="outline" asChild>
          <Link to={session ? "/calendar" : "/auth"}>{session ? "Open app" : "Sign in"}</Link>
        </Button>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-24">
        <div className="text-center">
          <h1 className="text-4xl font-bold">Pick your plan</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">
            Every plan includes the brand profile, the content calendar and unlimited reviews.
            Upgrade or downgrade at any time.
          </p>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`surface flex flex-col p-6 ${
                plan.highlight ? "ring-2 ring-primary" : ""
              }`}
            >
              {plan.highlight && (
                <span className="mb-3 w-fit rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-semibold text-primary-foreground">
                  Most popular
                </span>
              )}
              <h2 className="text-lg font-semibold">{plan.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{plan.tagline}</p>
              <p className="mt-6 font-display text-4xl font-bold">
                {formatINR(plan.priceMonthly)}
                <span className="text-sm font-normal text-muted-foreground">/month</span>
              </p>
              <ul className="mt-6 flex-1 space-y-3 text-sm">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span className="text-muted-foreground">{f}</span>
                  </li>
                ))}
              </ul>
              <Button
                className="mt-6 w-full"
                variant={plan.highlight ? "default" : "outline"}
                asChild
              >
                {session ? (
                  <Link to="/checkout" search={{ plan: plan.id }}>
                    Choose {plan.name}
                  </Link>
                ) : (
                  <Link to="/auth" search={{ redirect: "/pricing" }}>
                    Choose {plan.name}
                  </Link>
                )}
              </Button>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
