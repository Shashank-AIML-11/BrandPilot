import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Check, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatINR, planById } from "@/lib/plans";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/plan")({
  head: () => ({
    meta: [
      { title: "Your plan — LOVIZA" },
      { name: "description", content: "Review your LOVIZA subscription and billing history." },
      { property: "og:title", content: "Your plan — LOVIZA" },
      { property: "og:description", content: "Review your LOVIZA subscription and billing." },
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

  /*
   * The current plan is whichever subscription row is actually active
   * right now — NOT a profiles.plan column, which doesn't get kept in
   * sync with payment status. subs is already ordered by created_at
   * descending, so the first "active" match is the most recent one.
   */
  const activeSub = data?.subs.find((s) => s.status === "active");
  const current = activeSub ? planById(activeSub.plan) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Your plan</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your subscription and see past checkout submissions.
        </p>
      </div>

      {current ? (
        <div className="surface p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Your Active Plan
              </p>
              <h2 className="mt-1 font-display text-2xl font-bold">{current.name}</h2>
            </div>
            <p className="font-display text-2xl font-bold">
              {formatINR(current.priceMonthly)}
              <span className="text-sm font-normal text-muted-foreground">/mo</span>
            </p>
          </div>
          <ul className="mt-5 grid gap-2 sm:grid-cols-2">
            {current.features.map((f) => (
              <li key={f} className="flex gap-2 text-sm text-muted-foreground">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                {f}
              </li>
            ))}
          </ul>
          <Button className="mt-6" asChild>
            <Link to="/pricing">Change plan</Link>
          </Button>
        </div>
      ) : (
        <div className="surface p-6">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Your Active Plan</p>
          <h2 className="mt-1 font-display text-2xl font-bold">No Active Plan</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            You don't have an active subscription right now. Choose a plan to start generating
            content.
          </p>
          <Button className="mt-6" asChild>
            <Link to="/pricing">Choose a plan</Link>
          </Button>
        </div>
      )}

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
                <span>{formatINR((s.price_cents ?? 0) / 100)}</span>
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
