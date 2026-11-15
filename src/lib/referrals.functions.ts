import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { MAX_REFERRAL_PERCENT, USER_REFERRAL_PERCENT } from "@/lib/referrals.shared";

/**
 * Referral links.
 *  - Paid users: one personal link, 20% off for the person they refer.
 *  - Root account: any number of links with a custom discount, optionally
 *    locked to one email address.
 */

export interface MyReferral {
  /** Only users with a running paid plan (or the root account) may create a link. */
  canCreate: boolean;
  /** Why not, when canCreate is false. */
  reason: string | null;
  code: string | null;
  discountPercent: number;
  usesCount: number;
}

// ---------------------------------------------------------------------------
// Paid users
// ---------------------------------------------------------------------------

export const getMyReferral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyReferral> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getGenerationEntitlement } = await import("@/lib/generation-entitlements");
    const { db } = await import("@/lib/referrals.server");

    const { data: existing, error } = await (
      await db()
    )
      .from("referral_codes")
      .select("code, discount_percent, uses_count")
      .eq("created_by", context.userId)
      .eq("created_by_root", false)
      .maybeSingle();
    if (error) throw new Error(error.message);

    let canCreate = true;
    let reason: string | null = null;
    try {
      await getGenerationEntitlement(supabaseAdmin, context.userId);
    } catch (err) {
      canCreate = false;
      reason =
        err instanceof Error && err.message !== "Upgrade Plan"
          ? err.message
          : "Referral links are available to paid plans.";
    }

    return {
      canCreate,
      reason,
      code: (existing?.code as string | undefined) ?? null,
      discountPercent: (existing?.discount_percent as number | undefined) ?? USER_REFERRAL_PERCENT,
      usesCount: (existing?.uses_count as number | undefined) ?? 0,
    };
  });

export const createMyReferral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyReferral> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getGenerationEntitlement } = await import("@/lib/generation-entitlements");
    const { insertReferral } = await import("@/lib/referrals.server");

    // Paid users only. Throws "Upgrade Plan" / "Your plan has expired..." otherwise.
    try {
      await getGenerationEntitlement(supabaseAdmin, context.userId);
    } catch (err) {
      throw new Error(
        err instanceof Error && err.message !== "Upgrade Plan"
          ? err.message
          : "Referral links are available to paid plans.",
      );
    }

    const row = await insertReferral({
      created_by: context.userId,
      created_by_root: false,
      discount_percent: USER_REFERRAL_PERCENT,
    });
    return {
      canCreate: true,
      reason: null,
      code: row.code,
      discountPercent: row.discount_percent,
      usesCount: row.uses_count,
    };
  });

// ---------------------------------------------------------------------------
// Checkout (anyone with a link)
// ---------------------------------------------------------------------------

const codeInput = z.object({ code: z.string().min(1).max(64) });

/** Public: lets the pricing page say "20% off applied" before sign-in. Reveals nothing else. */
export const previewReferral = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => codeInput.parse(input))
  .handler(async ({ data }) => {
    const { lookupUsableCode } = await import("@/lib/referrals.server");
    const result = await lookupUsableCode(data.code);
    return result.ok
      ? {
          valid: true as const,
          code: result.referral.code,
          discountPercent: result.referral.discount_percent,
        }
      : { valid: false as const, reason: result.reason };
  });

/** Signed in: can THIS person use this code (first plan, right email, not their own)? */
export const checkReferralForCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => codeInput.parse(input))
  .handler(async ({ data, context }) => {
    const { checkReferralForUser, emailForUser } = await import("@/lib/referrals.server");
    const email = await emailForUser(context.userId);
    const result = await checkReferralForUser(data.code, { id: context.userId, email });
    return result.ok
      ? {
          ok: true as const,
          code: result.referral.code,
          discountPercent: result.referral.discount_percent,
        }
      : { ok: false as const, reason: result.reason };
  });

// ---------------------------------------------------------------------------
// Root account: custom links
// ---------------------------------------------------------------------------

async function assertRoot(context: {
  supabase: import("@supabase/supabase-js").SupabaseClient<
    import("@/integrations/supabase/types").Database
  >;
  userId: string;
}) {
  const { ROOT_EMAIL } = await import("@/lib/generation-entitlements");
  const { data: roles } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if ((roles ?? []).some((r) => r.role === "root")) return;
  const { data } = await context.supabase.auth.getUser();
  if (data.user?.email?.toLowerCase() === ROOT_EMAIL) return;
  throw new Error("Root access required");
}

export interface AdminReferral {
  id: string;
  code: string;
  discountPercent: number;
  restrictedEmail: string | null;
  note: string | null;
  maxUses: number | null;
  usesCount: number;
  active: boolean;
  expiresAt: string | null;
  createdAt: string;
  createdByRoot: boolean;
  ownerEmail: string | null;
}

export const adminListReferrals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminReferral[]> => {
    await assertRoot(context);
    const { db } = await import("@/lib/referrals.server");
    const d = await db();
    const { data, error } = await d
      .from("referral_codes")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Array<Record<string, unknown>>;

    const ownerIds = [...new Set(rows.map((r) => r["created_by"] as string))];
    const { data: owners } = ownerIds.length
      ? await d.from("profiles").select("id, email").in("id", ownerIds)
      : { data: [] as Array<{ id: string; email: string | null }> };
    const emailById = new Map(
      (owners ?? []).map((o: { id: string; email: string | null }) => [o.id, o.email]),
    );

    return rows.map((r) => ({
      id: r["id"] as string,
      code: r["code"] as string,
      discountPercent: r["discount_percent"] as number,
      restrictedEmail: (r["restricted_email"] as string | null) ?? null,
      note: (r["note"] as string | null) ?? null,
      maxUses: (r["max_uses"] as number | null) ?? null,
      usesCount: r["uses_count"] as number,
      active: r["active"] as boolean,
      expiresAt: (r["expires_at"] as string | null) ?? null,
      createdAt: r["created_at"] as string,
      createdByRoot: r["created_by_root"] as boolean,
      ownerEmail: emailById.get(r["created_by"] as string) ?? null,
    }));
  });

const createInput = z.object({
  discountPercent: z.number().int().min(1).max(MAX_REFERRAL_PERCENT),
  email: z.string().trim().toLowerCase().email().max(255).optional().or(z.literal("")),
  maxUses: z.number().int().min(1).max(100000).optional(),
  expiresInDays: z.number().int().min(1).max(3650).optional(),
  note: z.string().trim().max(200).optional(),
});

export const adminCreateReferral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertRoot(context);
    const { insertReferral } = await import("@/lib/referrals.server");
    const row = await insertReferral({
      created_by: context.userId,
      created_by_root: true,
      discount_percent: data.discountPercent,
      restricted_email: data.email ? data.email : null,
      note: data.note ? data.note : null,
      max_uses: data.maxUses ?? null,
      expires_at: data.expiresInDays
        ? new Date(Date.now() + data.expiresInDays * 86_400_000).toISOString()
        : null,
    });
    return {
      id: row.id,
      code: row.code,
      discountPercent: row.discount_percent,
      restrictedEmail: row.restricted_email,
    };
  });

const activeInput = z.object({ id: z.string().uuid(), active: z.boolean() });

export const adminSetReferralActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => activeInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertRoot(context);
    const { db } = await import("@/lib/referrals.server");
    const { error } = await (
      await db()
    )
      .from("referral_codes")
      .update({ active: data.active })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
