import { ANNUAL_DISCOUNT_PERCENT, type BillingCycle } from "@/lib/plans";
import { cn } from "@/lib/utils";

/** Monthly / Annual switch. Annual carries the "Save 40%" badge. */
export function BillingToggle({
  value,
  onChange,
  className,
}: {
  value: BillingCycle;
  onChange: (next: BillingCycle) => void;
  className?: string;
}) {
  const option = (cycle: BillingCycle, label: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={value === cycle}
      onClick={() => onChange(cycle)}
      className={cn(
        "flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
        value === cycle
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
      {cycle === "annual" && (
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-semibold",
            value === "annual"
              ? "bg-primary-foreground/20 text-primary-foreground"
              : "bg-primary/15 text-primary",
          )}
        >
          Save {ANNUAL_DISCOUNT_PERCENT}%
        </span>
      )}
    </button>
  );

  return (
    <div
      role="radiogroup"
      aria-label="Billing period"
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border bg-card p-1",
        className,
      )}
    >
      {option("monthly", "Monthly")}
      {option("annual", "Annual")}
    </div>
  );
}
