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
}

export const PLAN_EXPIRED_MESSAGE = "Your plan has expired. Renew to continue.";

type SubRow = {
  plan: string;
  status: string;
  current_period_end: string | null;
  razorpay_subscription_id: string | null;
};

/** A plan period counts only while it is paid for; old autopay rows get a short grace. */
function rowIsCurrent(row: SubRow, now: Date): boolean {
  const grace = row.razorpay_subscription_id ? LEGACY_AUTOPAY_GRACE_DAYS : 0;
  return isPeriodActive(row.current_period_end, now, grace);
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
    .select("plan, status, created_at, current_period_end, razorpay_subscription_id")
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
      .select("user_id, plan, status, current_period_end, razorpay_subscription_id")
      .in("user_id", userIds)
      .in("status", ["pending", "active"]),
    supabase.from("profiles").select("id, email").in("id", userIds),
  ]);

  const now = new Date();
  for (const row of (subs ?? []) as unknown as Array<SubRow & { user_id: string }>) {
    if (rowIsCurrent(row, now)) allowed.add(row.user_id);
  }
  for (const p of profiles ?? []) {
    if (p.email?.trim().toLowerCase() === ROOT_EMAIL) allowed.add(p.id);
  }
  return allowed;
}
