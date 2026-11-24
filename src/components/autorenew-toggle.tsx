import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, RefreshCw } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { formatINR, planById, planTotalInr, type BillingCycle, type PlanId } from "@/lib/plans";
import { formatIstDate } from "@/lib/plan-access";
import { cancelAutorenew, getAutorenewStatus } from "@/lib/autorenew.functions";
import { runAutorenewCheckout } from "@/lib/payments/autorenew-checkout";

/** Banks do not allow automatic debits above this without the customer approving each charge. */
export const AUTODEBIT_LIMIT_INR = 15000;

/**
 * The Auto-renew ON/OFF switch. ON opens Razorpay once so the customer approves a UPI AutoPay
 * or card mandate; OFF stops future charges (the paid period keeps running until its end date).
 */
export function AutoRenewToggle({
  planId,
  cycle,
  periodEnd,
}: {
  planId: PlanId;
  cycle: BillingCycle;
  /** End of the paid period, shown as the date of the next automatic charge. */
  periodEnd?: string | null | undefined;
}) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const plan = planById(planId);

  const { data } = useQuery({
    queryKey: ["autorenew"],
    queryFn: () => getAutorenewStatus(),
  });
  const on = Boolean(data?.enabled);
  const amount = plan ? planTotalInr(plan, cycle) : 0;

  async function turnOn() {
    setBusy(true);
    try {
      const out = await runAutorenewCheckout(planId, cycle);
      if (!out) return; // window closed without approving
      await queryClient.invalidateQueries();
      toast.success(
        out.scheduled && out.firstChargeAt
          ? `Auto-renew is ON. The first automatic charge is on ${formatIstDate(out.firstChargeAt)}.`
          : `Auto-renew is ON. ${out.planName} is active${out.periodEnd ? ` until ${formatIstDate(out.periodEnd)}` : ""}.`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not turn on auto-renew");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    const when = data?.nextChargeAt ?? periodEnd;
    const ok = window.confirm(
      `Turn off auto-renew?\n\nYour plan stays active${when ? ` until ${formatIstDate(when)}` : ""}. After that it will not renew by itself, and you can renew from the Renew page.`,
    );
    if (!ok) return;
    setBusy(true);
    try {
      await cancelAutorenew();
      await queryClient.invalidateQueries();
      toast.success("Auto-renew is OFF. Your plan stays active until its end date.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not turn off auto-renew");
    } finally {
      setBusy(false);
    }
  }

  const nextAt = data?.nextChargeAt ?? periodEnd ?? null;

  return (
    <section className="surface p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div className="space-y-1 text-sm">
            <p className="font-semibold">Auto-renew {on ? "is ON" : "is OFF"}</p>
            {on ? (
              <p className="text-muted-foreground">
                {formatINR(data?.amountInr ?? amount)} is charged automatically
                {nextAt ? ` on ${formatIstDate(nextAt)}` : " when your plan ends"}, using the UPI or card
                you approved. You can turn it off any time.
              </p>
            ) : (
              <p className="text-muted-foreground">
                Approve once with UPI AutoPay or your card and your plan renews by itself every{" "}
                {cycle === "annual" ? "year" : "month"} ({formatINR(amount)}). No reminders to remember.
              </p>
            )}
            {data?.status === "pending" && (
              <p className="text-xs text-destructive">
                The last automatic payment did not go through. Your bank will retry; make sure the
                account has enough balance.
              </p>
            )}
            {amount > AUTODEBIT_LIMIT_INR && (
              <p className="text-xs text-muted-foreground">
                Charges above {formatINR(AUTODEBIT_LIMIT_INR)} may need your approval in your UPI or bank
                app each time, because banks do not allow fully automatic debits above that amount.
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          <Switch
            checked={on}
            disabled={busy || !plan}
            onCheckedChange={(v) => void (v ? turnOn() : turnOff())}
            aria-label="Auto-renew"
          />
        </div>
      </div>
    </section>
  );
}
