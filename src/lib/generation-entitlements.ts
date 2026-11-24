import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { planById, type Plan } from "@/lib/plans";
import { isPeriodActive, LEGACY_AUTOPAY_GRACE_DAYS } from "@/lib/plan-access";

export const ROOT_EMAIL = "shashank.bawane@gmail.com";

export interface GenerationEntitlement {
  plan: Plan;
  isRoot: boolean;
  /** When the paid period ends (ISO). Null for the root account / legacy rows. */
  periodEnd?: string | null;
  /**
   * Set when the person has no plan but paid for the one-time pass: a single
   * generation for the current week, no autoposting. `usedAt` is set once that
   * generation has been started.
   */
  oneTimePass?: { id: string; expiresAt: string; usedAt: string | null };
}

export const PLAN_EXPIRED_MESSAGE = "Your plan has expired. Renew to continue.";

type SubRow = {
  plan: string;
  status: string;
  current_period_end: string | null;
  razorpay_subscription_id: string | null;
  auto_renew?: boolean | null;
};

/** A plan period counts only while it is paid for; old autopay rows get a short grace. */
function rowIsCurrent(row: SubRow, now: Date): boolean {
  // Old autopay rows and auto-renew customers get a few days for the charge to arrive.
  const grace = row.razorpay_subscription_id || row.auto_renew ? LEGACY_AUTOPAY_GRACE_DAYS : 0;
  return isPeriodActive(row.current_period_end, now, grace);
}

type LooseClient = SupabaseClient<any, "public", any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** A paid, unexpired one-time pass for this user, if any. Never throws. */
export async function activeOneTimePass(
  supabase: unknown,
  userId: string,
): Promise<{ id: string; expiresAt: string; usedAt: string | null } | null> {
  try {
    const { data } = await (supabase as LooseClient)
      .from("one_time_passes")
      .select("id, expires_at, used_at")
      .eq("user_id", userId)
      .eq("status", "paid")
      .gt("expires_at", new Date().toISOString())
      .order("expires_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return null;
    return { id: data.id, expiresAt: data.expires_at, usedAt: data.used_at ?? null };
  } catch {
    return null;
  }
}

/** Returns the paid plan recorded by checkout. Profile.plan is deliberately not
 * used here because clients can edit their own profile record. */
export async function getGenerationEntitlement(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<GenerationEntitlement> {
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) throw new Error(profileError.message);

  if (profile?.email.trim().toLowerCase() === ROOT_EMAIL) {
    const plan = planById("scale");
    if (!plan) throw new Error("Scale plan configuration is missing.");
    return { plan, isRoot: true };
  }

  // Filter to pending/active status *before* ordering — otherwise a
  // newer abandoned or failed checkout row (status "created",
  // "cancelled", etc.) can outrank a genuinely active subscription
  // just for being more recent, and a paying user gets locked out.
  //
  // Plans are prepaid 30-day periods: a row only counts while its
  // current_period_end is in the future. That is checked here (not just by
  // the daily job), so features stop at the exact moment the plan ends.
  const { data: subscriptions, error: subscriptionError } = await supabase
    .from("subscriptions")
    .select("plan, status, created_at, current_period_end, razorpay_subscription_id, auto_renew")
    .eq("user_id", userId)
    .in("status", ["pending", "active"])
    .order("created_at", { ascending: false })
    .limit(10);
  if (subscriptionError) throw new Error(subscriptionError.message);

  const rows = (subscriptions ?? []) as unknown as SubRow[];
  const now = new Date();
  const current = rows.find((r) => rowIsCurrent(r, now));

  const plan = planById(current?.plan);
  if (!plan) {
    // No plan: a paid one-time pass still allows the current week's generation.
    const pass = await activeOneTimePass(supabase, userId);
    const starter = planById("starter");
    if (pass && starter) {
      return {
        plan: { ...starter, name: "One-time week", autoPost: false },
        isRoot: false,
        periodEnd: pass.expiresAt,
        oneTimePass: pass,
      };
    }
    // Had a plan that has since lapsed vs. never had one.
    throw new Error(rows.length > 0 ? PLAN_EXPIRED_MESSAGE : "Upgrade Plan");
  }
  return { plan, isRoot: false, periodEnd: current?.current_period_end ?? null };
}

/**
 * Which of these users may use paid features right now (paid, unexpired plan
 * or the root account). Used by background jobs so they skip lapsed users
 * quietly instead of treating it as a failure.
 */
export async function usersWithAccess(
  supabase: SupabaseClient<Database>,
  userIds: string[],
): Promise<Set<string>> {
  const allowed = new Set<string>();
  if (userIds.length === 0) return allowed;

  const [{ data: subs }, { data: profiles }] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("user_id, plan, status, current_period_end, razorpay_subscription_id, auto_renew")
      .in("user_id", userIds)
      .in("status", ["pending", "active"]),
    supabase.from("profiles").select("id, email").in("id", userIds),
  ]);

  // People holding a valid one-time pass count as having access too.
  try {
    const { data: passes } = await (supabase as unknown as LooseClient)
      .from("one_time_passes")
      .select("user_id")
      .in("user_id", userIds)
      .eq("status", "paid")
      .gt("expires_at", new Date().toISOString());
    for (const p of passes ?? []) allowed.add(p.user_id as string);
  } catch {
    /* table not created yet: no passes */
  }

  const now = new Date();
  for (const row of (subs ?? []) as unknown as Array<SubRow & { user_id: string }>) {
    if (rowIsCurrent(row, now)) allowed.add(row.user_id);
  }
  for (const p of profiles ?? []) {
    if (p.email?.trim().toLowerCase() === ROOT_EMAIL) allowed.add(p.id);
  }
  return allowed;
}
