import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Check, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { planById } from "@/lib/plans";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/plan")({
  head: () => ({
    meta: [
      { title: "Your plan — LOVIZA123" },
      { name: "description", content: "Review your LOVIZA123 subscription and billing history." },
      { property: "og:title", content: "Your plan — LOVIZA123" },
      { property: "og:description", content: "Review your LOVIZA123 subscription and billing." },
    ],
  }),
  component: PlanPage,
});

function PlanPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["plan"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const id = userData.user!.id;
      const { data: subs } = await supabase
          .from("subscriptions")
          .select("*")
          .eq("user_id", id)
          .order("created_at", { ascending: false });
      return { subs: subs ?? [] };
    },
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const latestSubscription = data?.subs[0];
  const current = ["pending", "active"].includes(latestSubscription?.status ?? "")
    ? planById(latestSubscription?.plan)
    : undefined;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Your plan</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your subscription and see past checkout submissions.
        </p>
      </div>

      <div className="surface p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Current plan</p>
            <h2 className="mt-1 font-display text-2xl font-bold">{current?.name ?? "No active plan"}</h2>
          </div>
          {current && (
            <p className="font-display text-2xl font-bold">
              ${current.priceMonthly}
              <span className="text-sm font-normal text-muted-foreground">/mo</span>
            </p>
          )}
        </div>
        {current ? (
          <ul className="mt-5 grid gap-2 sm:grid-cols-2">
            {current.features.map((f) => (
            <li key={f} className="flex gap-2 text-sm text-muted-foreground">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              {f}
            </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            Subscribe to a plan before generating any content.
          </p>
        )}
        <Button className="mt-6" asChild>
          <Link to="/pricing">Change plan</Link>
        </Button>
      </div>

      <div className="surface p-6">
        <h2 className="text-sm font-semibold">Subscription history</h2>
        <ul className="mt-4 divide-y divide-border text-sm">
          {data?.subs.map((s) => (
            <li key={s.id} className="flex items-center justify-between py-3">
              <div>
                <p className="capitalize">
                  {s.plan} · {s.payment_method}
                </p>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(s.created_at), "d MMM yyyy, HH:mm")}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span>${((s.price_cents ?? 0) / 100).toFixed(2)}</span>
                <Badge variant="secondary" className="capitalize">
                  {s.status}
                </Badge>
              </div>
            </li>
          ))}
          {!data?.subs.length && (
            <li className="py-3 text-muted-foreground">No subscriptions yet.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
