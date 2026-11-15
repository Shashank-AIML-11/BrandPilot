import { useEffect, useRef } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Clock } from "lucide-react";
import { getPlanStatus } from "@/lib/payments.functions";
import { formatIstDate } from "@/lib/plan-access";
import { Button } from "@/components/ui/button";

/**
 * Shown at the top of every signed-in page when the plan ends within 5 days
 * or has already ended. Hidden on the renewal / checkout pages themselves.
 */
export function PlanStatusBanner() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["plan-status"],
    queryFn: () => getPlanStatus(),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });

  // When the server notices the plan has lapsed, refresh the rest of the app
  // (the header's plan label, agency view, ...) once.
  const refreshedRef = useRef(false);
  useEffect(() => {
    if (data?.state === "expired" && !refreshedRef.current) {
      refreshedRef.current = true;
      queryClient.invalidateQueries({ queryKey: ["me"] });
      queryClient.invalidateQueries({ queryKey: ["plan"] });
      queryClient.invalidateQueries({ queryKey: ["current-plan-id"] });
    }
  }, [data?.state, queryClient]);

  // The owner account never loses features, so it is not nagged.
  if (!data || data.isRoot) return null;
  if (data.state !== "expiring" && data.state !== "expired") return null;
  if (pathname === "/renew" || pathname === "/checkout") return null;

  const expired = data.state === "expired";
  const end = data.periodEnd ? formatIstDate(data.periodEnd) : "";
  const left = data.daysLeft ?? 0;
  const message = expired
    ? `Your ${data.planName} plan ended on ${end}. Content generation and posting are paused until you renew.`
    : left <= 0
      ? `Your ${data.planName} plan ends today. Renew now to keep everything running.`
      : `Your ${data.planName} plan ends in ${left} ${left === 1 ? "day" : "days"} (${end}). Renew now and we add 30 days on top, so you lose nothing.`;

  return (
    <div
      role="status"
      className={`mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
        expired
          ? "border-destructive/40 bg-destructive/10 text-foreground"
          : "border-primary/40 bg-primary/10 text-foreground"
      }`}
    >
      <span className="flex items-center gap-2">
        {expired ? (
          <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
        ) : (
          <Clock className="h-4 w-4 shrink-0 text-primary" />
        )}
        {message}
      </span>
      <Button size="sm" asChild>
        <Link to="/renew">Renew plan</Link>
      </Button>
    </div>
  );
}
