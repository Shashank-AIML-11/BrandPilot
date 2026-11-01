import { Link } from "@tanstack/react-router";
import { BarChart3, Building2, CalendarDays, LibraryBig, Plus, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AgencyBrand } from "@/lib/agency";
import type { Plan } from "@/lib/plans";

const WORKSPACE = [
  { to: "/brand-profile", label: "Brand Profile", icon: Building2 },
  { to: "/calendar", label: "Content Calendar", icon: CalendarDays },
  { to: "/content-library", label: "Content Library", icon: LibraryBig },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
] as const;

const SWATCHES = [
  "bg-emerald-900/50 text-emerald-300",
  "bg-violet-900/50 text-violet-300",
  "bg-sky-900/50 text-sky-300",
  "bg-orange-900/50 text-orange-300",
];

const rowBase =
  "flex min-h-11 w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent";
const rowActive =
  "bg-sidebar-accent font-medium text-sidebar-accent-foreground ring-1 ring-inset ring-sidebar-border";

interface Props {
  brands: AgencyBrand[];
  activeBrandId: string | null;
  plan: Plan;
  showAdmin: boolean;
  onSelectBrand: (id: string) => void;
}

/** Sidebar for Scale-plan (agency) users: brand switcher + per-brand workspace. */
export function AgencySidebar({
  brands,
  activeBrandId,
  plan,
  showAdmin,
  onSelectBrand,
}: Props) {
  const used = brands.length;
  const limit = plan.brandProfileLimit;
  const atLimit = used >= limit;
  const activeBrand = brands.find((b) => b.id === activeBrandId);
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;

  return (
    <div className="flex min-h-full flex-col gap-6">
      <nav aria-label="Client brands" className="space-y-1">
        <div className="flex items-center justify-between px-2.5 pb-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Brands
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {used} / {limit}
          </span>
        </div>

        {brands.map((brand, i) => {
          const active = brand.id === activeBrandId;
          const pending = brand.status === "intake_pending";
          return (
            <button
              key={brand.id}
              type="button"
              onClick={() => onSelectBrand(brand.id)}
              aria-current={active ? "true" : undefined}
              className={cn(rowBase, active && rowActive)}
            >
              <span
                className={cn(
                  "flex h-7 w-7 flex-none items-center justify-center rounded-lg text-xs font-bold",
                  active
                    ? "bg-primary text-primary-foreground"
                    : pending
                      ? "text-muted-foreground ring-1 ring-inset ring-border"
                      : SWATCHES[i % SWATCHES.length],
                )}
              >
                {(brand.name[0] ?? "?").toUpperCase()}
              </span>
              <span className="min-w-0 flex-1 truncate">{brand.name}</span>
              {pending && (
                <span className="whitespace-nowrap rounded-full border border-amber-900/60 px-2 py-0.5 text-[11px] text-amber-300">
                  Intake pending
                </span>
              )}
            </button>
          );
        })}

        {atLimit ? (
          <div
            aria-disabled="true"
            title={`Your ${plan.name} plan includes ${limit} brands`}
            className={cn(
              rowBase,
              "mt-2 cursor-not-allowed border border-dashed border-border text-amber-300 opacity-50 hover:bg-transparent",
            )}
          >
            <Plus className="h-4 w-4" />
            Brand limit reached
          </div>
        ) : (
          <Link
            to="/add-brand"
            className={cn(rowBase, "mt-2 border border-dashed border-border text-amber-300")}
            activeProps={{
              className: cn(rowBase, "mt-2 border border-dashed border-primary text-amber-300"),
            }}
          >
            <Plus className="h-4 w-4" />
            Add brand
          </Link>
        )}
      </nav>

      {activeBrand && (
        <nav aria-label={`${activeBrand.name} workspace`} className="space-y-1">
          <div className="px-2.5 pb-2">
            <span className="block truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {activeBrand.name}
            </span>
          </div>
          {WORKSPACE.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={rowBase}
              activeProps={{ className: cn(rowBase, rowActive) }}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
          {showAdmin && (
            <Link
              to="/admin"
              className={rowBase}
              activeProps={{ className: cn(rowBase, rowActive) }}
            >
              <ShieldCheck className="h-4 w-4" />
              Admin Portal
            </Link>
          )}
        </nav>
      )}

      <div className="mt-auto rounded-xl border border-sidebar-border bg-card p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Your active plan
        </p>
        <p className="mt-1 font-display text-xl font-bold">{plan.name}</p>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {used} of {limit} brands used
        </p>
        <div
          className="mt-2.5 h-1.5 rounded-full bg-border"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={limit}
          aria-valuenow={used}
          aria-label="Brands used"
        >
          <div className="h-1.5 rounded-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
        <Button size="sm" variant="outline" className="mt-3.5 w-full" asChild>
          <Link to="/plan">Manage plan</Link>
        </Button>
      </div>
    </div>
  );
}
