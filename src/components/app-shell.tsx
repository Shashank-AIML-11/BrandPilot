import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CalendarDays,
  BarChart3,
  Building2,
  LibraryBig,
  ShieldCheck,
  Settings,
  CreditCard,
  HelpCircle,
  LifeBuoy,
  LogOut,
  Menu,
  Info,
  Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { planById } from "@/lib/plans";
import { AUTOPOST_CONSENT_TEXT, isAutopostOn } from "@/lib/autopost";
import { recordAutopostConsent } from "@/lib/autopost-consent.functions";
import { AgencySidebar } from "@/components/agency-sidebar";
import { SidebarOneTimeButton } from "@/components/one-time-generate";
import {
  agencyPlanFor,
  resolveActiveBrand,
  setActiveBrandId,
  useAgencyBrands,
  useStoredBrandId,
} from "@/lib/agency";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) return null;
      const [{ data: profile }, { data: roles }, { data: activeSub }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", user.id),
        /*
         * The "current plan" a user is on is whatever subscription row is
         * actually active right now — NOT profiles.plan, which doesn't
         * get kept in sync with payment status (that's the bug this
         * fixes: the UI used to always show "Starter" regardless of what
         * was actually subscribed/active). ordered by created_at so, if
         * more than one row is ever active at once, the most recent one
         * wins.
         */
        supabase
          .from("subscriptions")
          .select("*")
          .eq("user_id", user.id)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      const roleList = (roles ?? []).map((r) => r.role as string);
      return {
        user,
        profile,
        roles: roleList,
        isAdmin: roleList.includes("admin") || roleList.includes("root"),
        isEditor:
          roleList.includes("editor") || roleList.includes("admin") || roleList.includes("root"),
        activeSubscription: activeSub ?? null,
      };
    },
  });
}

const nav = [
  { to: "/brand-profile", label: "Brand Profile", icon: Building2 },
  { to: "/calendar", label: "Content Calendar", icon: CalendarDays },
  { to: "/content-library", label: "Content Library", icon: LibraryBig },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);

  const name = me?.profile?.full_name || me?.user.email || "Account";
  const badge = String(name)
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");

  const activePlan = planById(me?.activeSubscription?.plan);

  // Account-wide Autopost switch. It is ON only after the user presses "Accept" on the
  // notice below; until then the request is "pending" and nothing is saved.
  const autopostOn = isAutopostOn(me);
  const [autopostPending, setAutopostPending] = useState(false);
  const setAutopost = useMutation({
    mutationFn: async (next: boolean) => {
      if (!me?.user) throw new Error("Not signed in");
      // .select() returns the changed rows, so a silent "0 rows updated" is caught below.
      const { data, error } = await supabase
        .from("profiles")
        .update({ autopost_enabled: next } as never)
        .eq("id", me.user.id)
        .select("id");
      if (error) {
        throw new Error(
          /autopost_enabled/i.test(error.message)
            ? "The Autopost column is missing in the database. Run the autopost SQL migration first."
            : error.message,
        );
      }
      if (!data || data.length === 0) {
        // No profile row to update yet: create it.
        const { error: insertError } = await supabase
          .from("profiles")
          .upsert({ id: me.user.id, email: me.user.email ?? "", autopost_enabled: next } as never);
        if (insertError) throw new Error(insertError.message);
      }
      // Audit trail: the server stores who, when, IP address and plan. A failure here never
      // undoes the switch, but is logged so it can be investigated.
      try {
        await recordAutopostConsent({ data: { action: next ? "accepted" : "turned_off" } });
      } catch (consentError) {
        console.error("[autopost] could not record consent", consentError);
      }
      return next;
    },
    // Flip the switch immediately; roll back if saving fails.
    onMutate: async (next: boolean) => {
      await queryClient.cancelQueries({ queryKey: ["me"] });
      const previous = queryClient.getQueryData(["me"]);
      queryClient.setQueryData(["me"], (old: unknown) => {
        const o = old as { profile?: Record<string, unknown> | null } | null | undefined;
        return o ? { ...o, profile: { ...(o.profile ?? {}), autopost_enabled: next } } : o;
      });
      return { previous };
    },
    onSuccess: (next) => {
      // Turning ON is confirmed by the Accept button, so it needs no extra pop-up.
      if (!next) toast.success("Autopost is OFF. Nothing posts by itself; use Post now on a card.");
      void queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (e: unknown, _next, ctx) => {
      if (ctx?.previous !== undefined) queryClient.setQueryData(["me"], ctx.previous);
      toast.error(e instanceof Error ? e.message : "Could not change Autopost.");
    },
  });

  // Switching ON only asks for confirmation; the setting is saved when "Accept" is pressed.
  // Switching OFF (or back off while still pending) takes effect straight away.
  const toggleAutopost = (wantOn: boolean) => {
    if (wantOn) {
      setAutopostPending(true);
      return;
    }
    setAutopostPending(false);
    if (autopostOn) setAutopost.mutate(false);
  };
  const acceptAutopost = () =>
    setAutopost.mutate(true, { onSuccess: () => setAutopostPending(false) });

  // Scale-plan users get the agency sidebar (brand switcher) instead of the single-brand nav.
  const agencyPlan = agencyPlanFor(me);
  const { data: agencyBrands = [] } = useAgencyBrands(!!agencyPlan);
  const storedBrandId = useStoredBrandId();
  const activeBrand = resolveActiveBrand(agencyBrands, storedBrandId);

  /** Picking a brand shows that brand's pages straight away, even from the Add brand screen. */
  function selectBrand(id: string) {
    setActiveBrandId(id);
    if (pathname === "/add-brand") void navigate({ to: "/brand-profile" });
  }

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    // Navigate away from this protected page BEFORE actually signing out.
    // __root.tsx's global onAuthStateChange listener calls
    // router.invalidate() the moment SIGNED_OUT fires, which re-runs the
    // CURRENTLY active route's beforeLoad guard — if that's still a
    // protected page at that instant, its own guard (see
    // _authenticated/route.tsx) immediately redirects to /auth itself,
    // racing with (and beating) the explicit navigate below. Awaiting the
    // navigate first means the active route is already the public "/"
    // page by the time signOut() fires, so that guard never gets a
    // chance to run.
    await navigate({ to: "/", replace: true });
    await supabase.auth.signOut();
    // Send signed-out users to the public marketing site (e.g. https://loviza.click)
    // when VITE_LANDING_URL is set. Left unset (local / staging), they stay on this app's "/".
    const landingUrl = import.meta.env.VITE_LANDING_URL as string | undefined;
    if (landingUrl) window.location.assign(landingUrl);
  }

  // Autopost switch and the account menu live at the foot of the sidebar, so the page can start at the very top.
  const sidebarFooter = (
    <div className="mt-3 space-y-2">
      <label
        className="flex cursor-pointer items-center justify-between gap-2 rounded-lg border border-sidebar-border px-3 py-1.5 text-sm"
        title={
          autopostOn
            ? "Autopost is ON: content posts automatically at 7 AM daily, with no manual review"
            : autopostPending
              ? "Press Accept on the notice to turn Autopost on"
              : "Autopost is OFF: review content, then use Post now"
        }
      >
        <span className="font-medium">Autopost</span>
        <span className="flex items-center gap-2">
          <Switch
            checked={autopostOn || autopostPending}
            disabled={!me || setAutopost.isPending}
            onCheckedChange={toggleAutopost}
            aria-label="Autopost on or off"
          />
          <span
            className={cn(
              "min-w-[2.25rem] text-xs font-semibold",
              autopostOn ? "text-emerald-400" : autopostPending ? "text-amber-400" : "text-muted-foreground",
            )}
          >
            {autopostOn ? "ON" : autopostPending ? "Confirm" : "OFF"}
          </span>
        </span>
      </label>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-sidebar-accent"
            aria-label="Account menu"
          >
            <Avatar className="h-7 w-7 flex-none">
              <AvatarFallback className="bg-primary text-xs text-primary-foreground">{badge || "K"}</AvatarFallback>
            </Avatar>
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{me?.user.email ?? name}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="w-56">
          <DropdownMenuLabel className="truncate">{me?.user.email}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to="/settings">
              <Settings className="mr-2 h-4 w-4" /> Settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/plan">
              <CreditCard className="mr-2 h-4 w-4" /> Plan
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/faq">
              <HelpCircle className="mr-2 h-4 w-4" /> FAQ
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/help">
              <LifeBuoy className="mr-2 h-4 w-4" /> Help
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={signOut}>
            <LogOut className="mr-2 h-4 w-4" /> Logout
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  return (
    <div className="min-h-screen bg-background lg:flex">
      {/* Small screens only: a slim bar with the menu button. */}
      <header className="sticky top-0 z-30 flex h-12 items-center gap-3 border-b border-border bg-background/90 px-3 backdrop-blur lg:hidden">
        <Button variant="ghost" size="icon" onClick={() => setOpen((v) => !v)} aria-label="Toggle navigation">
          <Menu className="h-5 w-5" />
        </Button>
        <Link to="/calendar" className="font-display text-lg font-bold tracking-tight">
          LOVIZA<span className="text-primary">.</span>
        </Link>
      </header>

      {/* Consent notice: stays until the user presses Accept. */}
      {autopostPending && !autopostOn && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 left-4 z-50 w-[calc(100vw-2rem)] max-w-sm rounded-xl border border-emerald-500/40 bg-emerald-950/95 p-4 text-emerald-50 shadow-xl backdrop-blur lg:left-[17rem]"
        >
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
            <p className="text-sm leading-snug">{AUTOPOST_CONSENT_TEXT}</p>
          </div>
          <div className="mt-3 flex justify-end">
            <Button size="sm" onClick={acceptAutopost} disabled={setAutopost.isPending}>
              {setAutopost.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Accept
            </Button>
          </div>
        </div>
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <Link to="/calendar" className="flex h-11 flex-none items-center px-4 font-display text-lg font-bold tracking-tight">
          LOVIZA<span className="text-primary">.</span>
        </Link>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          {agencyPlan ? (
            <AgencySidebar
              brands={agencyBrands}
              activeBrandId={activeBrand?.id ?? null}
              plan={agencyPlan}
              showAdmin={!!me?.isAdmin}
              onSelectBrand={selectBrand}
              footer={sidebarFooter}
            />
          ) : (
            <div className="flex min-h-full flex-col">
              <nav className="space-y-1">
                {nav.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
                    activeProps={{
                      className:
                        "bg-sidebar-accent text-sidebar-accent-foreground font-medium ring-1 ring-sidebar-border",
                    }}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                ))}
                {me?.isAdmin && (
                  <Link
                    to="/admin"
                    className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
                    activeProps={{
                      className:
                        "bg-sidebar-accent text-sidebar-accent-foreground font-medium ring-1 ring-sidebar-border",
                    }}
                  >
                    <ShieldCheck className="h-4 w-4" />
                    Admin Portal
                  </Link>
                )}
              </nav>

              <div className="mt-auto pt-6">
                <div className="rounded-xl border border-sidebar-border bg-card p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {activePlan ? "Your Active Plan" : "Current plan"}
                  </p>
                  <p className="mt-1 font-display text-lg font-semibold capitalize">
                    {activePlan ? activePlan.name : "No Active Plan"}
                  </p>
                  <Button size="sm" variant="outline" className="mt-3 w-full" asChild>
                    <Link to="/pricing">{activePlan ? "Upgrade" : "Choose a plan"}</Link>
                  </Button>
                  {!activePlan && <SidebarOneTimeButton />}
                </div>
                <Button size="sm" variant="outline" className="mt-3 w-full" asChild>
                  <Link to="/referrals">Refer &amp; EARN 20%</Link>
                </Button>
                {sidebarFooter}
              </div>
            </div>
          )}
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-3 sm:px-6">{children}</main>
    </div>
  );
}
