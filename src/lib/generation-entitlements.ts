import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { planById, type Plan } from "@/lib/plans";

export const ROOT_EMAIL = "shashank.bawane@gmail.com";

export interface GenerationEntitlement {
  plan: Plan;
  isRoot: boolean;
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
  const { data: subscription, error: subscriptionError } = await supabase
    .from("subscriptions")
    .select("plan, status, created_at")
    .eq("user_id", userId)
    .in("status", ["pending", "active"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (subscriptionError) throw new Error(subscriptionError.message);

  const plan = planById(subscription?.plan);
  if (!plan) {
    throw new Error("Upgrade Plan");
  }
  return { plan, isRoot: false };
}
