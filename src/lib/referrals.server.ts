/** Referral rules, server-side only. */
import { randomInt } from "node:crypto";
import { untyped, type UntypedDb } from "@/lib/untyped-db.server";
import { CODE_LENGTH, codeAlphabet, normalizeReferralCode } from "@/lib/referrals.shared";

export interface ReferralRow {
  id: string;
  code: string;
  created_by: string;
  created_by_root: boolean;
  discount_percent: number;
  restricted_email: string | null;
  max_uses: number | null;
  uses_count: number;
  active: boolean;
  expires_at: string | null;
}

export type ReferralCheck = { ok: true; referral: ReferralRow } | { ok: false; reason: string };

export function generateCode(): string {
  const alphabet = codeAlphabet();
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) out += alphabet[randomInt(alphabet.length)];
  return out;
}

export async function db(): Promise<UntypedDb> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return untyped(supabaseAdmin);
}

/** Checks that do not depend on who is paying (used for the public preview too). */
export async function lookupUsableCode(rawCode: string): Promise<ReferralCheck> {
  const code = normalizeReferralCode(rawCode);
  if (!code) return { ok: false, reason: "Enter a referral code." };

  const { data, error } = await (
    await db()
  )
    .from("referral_codes")
    .select(
      "id, code, created_by, created_by_root, discount_percent, restricted_email, max_uses, uses_count, active, expires_at",
    )
    .eq("code", code)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const row = data as ReferralRow | null;
  if (!row || !row.active) return { ok: false, reason: "This referral code isn't valid." };
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
    return { ok: false, reason: "This referral code has expired." };
  }
  if (row.max_uses !== null && row.uses_count >= row.max_uses) {
    return { ok: false, reason: "This referral code has reached its use limit." };
  }
  return { ok: true, referral: row };
}

/** Everything that must be true for THIS person to get the discount. */
export async function checkReferralForUser(
  rawCode: string,
  user: { id: string; email: string | null },
): Promise<ReferralCheck> {
  const usable = await lookupUsableCode(rawCode);
  if (!usable.ok) return usable;
  const r = usable.referral;

  if (r.created_by === user.id) {
    return { ok: false, reason: "You can't use your own referral code." };
  }
  if (r.restricted_email) {
    if (
      !user.email ||
      user.email.trim().toLowerCase() !== r.restricted_email.trim().toLowerCase()
    ) {
      return { ok: false, reason: "This referral link was made for a different email address." };
    }
  }

  // First plan only: no earlier paid order and no earlier plan of any kind.
  const d = await db();
  const [{ count: paidOrders }, { count: pastPlans }] = await Promise.all([
    d
      .from("plan_orders")
      .select("razorpay_order_id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "paid"),
    d
      .from("subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .in("status", ["active", "expired", "cancelled", "halted", "completed"]),
  ]);
  if ((paidOrders ?? 0) > 0 || (pastPlans ?? 0) > 0) {
    return { ok: false, reason: "Referral discounts apply to your first plan only." };
  }
  return { ok: true, referral: r };
}

export async function emailForUser(userId: string): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .maybeSingle();
  if (profile?.email?.trim()) return profile.email.trim();
  const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
  return data.user?.email?.trim() || null;
}

/** Inserts a code, retrying on the (very unlikely) chance the random code already exists. */
export async function insertReferral(values: {
  created_by: string;
  created_by_root: boolean;
  discount_percent: number;
  restricted_email?: string | null;
  note?: string | null;
  max_uses?: number | null;
  expires_at?: string | null;
}): Promise<ReferralRow> {
  const d = await db();
  for (let attempt = 0; attempt < 6; attempt++) {
    const { data, error } = await d
      .from("referral_codes")
      .insert({ ...values, code: generateCode() })
      .select("*")
      .single();
    if (!error) return data as ReferralRow;
    if (error.code !== "23505") throw new Error(error.message);
    // 23505 = unique violation. Either the code collided (retry) or this user already has a personal code.
    if (!values.created_by_root) {
      const { data: existing } = await d
        .from("referral_codes")
        .select("*")
        .eq("created_by", values.created_by)
        .eq("created_by_root", false)
        .maybeSingle();
      if (existing) return existing as ReferralRow;
    }
  }
  throw new Error("Could not create a referral code. Please try again.");
}
