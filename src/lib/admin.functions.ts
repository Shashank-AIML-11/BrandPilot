import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const PRIMARY_ROOT_EMAIL = "shashank.bawane@gmail.com";

type Ctx = { supabase: SupabaseClient<Database>; userId: string };

async function getAccess(context: Ctx) {
  const { data } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  let roles = (data ?? []).map((r) => r.role as string);

  // Self-healing bootstrap: PRIMARY_ROOT_EMAIL is meant to always have
  // root access, but nothing ever actually inserted that row — it was
  // only ever used defensively (to block demoting/deleting it). If this
  // account has no roles yet and its email matches, grant root now
  // instead of leaving them permanently locked out of their own portal.
  // Harmless to repeat: only fires when roles is empty.
  if (roles.length === 0) {
    const { data: authUser } = await context.supabase.auth.getUser();
    const email = authUser.user?.email?.toLowerCase();
    if (email === PRIMARY_ROOT_EMAIL) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin
        .from("user_roles")
        .upsert(
          { user_id: context.userId, email, role: "root" },
          { onConflict: "email,role" },
        );
      roles = ["root"];
    }
  }

  return {
    roles,
    isRoot: roles.includes("root"),
    isAdmin: roles.includes("admin") || roles.includes("root"),
  };
}

async function assertAdmin(context: Ctx) {
  const access = await getAccess(context);
  if (!access.isAdmin) throw new Error("Forbidden");
  return access;
}

async function assertRoot(context: Ctx) {
  const access = await getAccess(context);
  if (!access.isRoot) throw new Error("Root access required");
  return access;
}

const grantInput = z.object({
  email: z.string().email().max(255),
  role: z.enum(["viewer", "editor", "admin", "root"]),
});

/** Rough billing-period length used only to estimate a renewal date for
 *  display — no exact next-charge date is stored anywhere currently. */
function estimateRenewal(createdAt: string, billingPeriod: string): string | null {
  const start = new Date(createdAt);
  if (Number.isNaN(start.getTime())) return null;
  const next = new Date(start);
  if (billingPeriod === "yearly") next.setFullYear(next.getFullYear() + 1);
  else next.setMonth(next.getMonth() + 1);
  return next.toISOString();
}

export const getAdminStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const access = await assertAdmin(context);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [profiles, subs, content, roles] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, email, full_name, plan, created_at"),
      supabaseAdmin
        .from("subscriptions")
        .select("user_id, plan, price_cents, billing_period, status, created_at")
        .order("created_at", { ascending: false }),
      supabaseAdmin.from("content_items").select("id, status, type, impressions, clicks"),
      supabaseAdmin.from("user_roles").select("id, user_id, email, role, created_at"),
    ]);

    const subRows = subs.data ?? [];
    const active = subRows.filter((s) => s.status === "active");
    const expired = subRows.filter((s) => s.status === "cancelled");
    const contentRows = content.data ?? [];
    const profileRows = profiles.data ?? [];
    const roleRows = roles.data ?? [];

    // subRows is already newest-first, so the first match per user is
    // their current/most recent subscription.
    const latestSubByUser = new Map<string, (typeof subRows)[number]>();
    for (const s of subRows) {
      if (!latestSubByUser.has(s.user_id)) latestSubByUser.set(s.user_id, s);
    }

    const subscriberRows = profileRows.map((p) => {
      const sub = latestSubByUser.get(p.id);
      return {
        id: p.id,
        email: p.email,
        fullName: p.full_name,
        plan: sub?.plan ?? p.plan ?? "starter",
        billingPeriod: sub?.billing_period ?? "monthly",
        status: sub?.status ?? "none",
        startDate: sub?.created_at ?? null,
        endDate:
          sub?.status === "active" && sub.created_at
            ? estimateRenewal(sub.created_at, sub.billing_period)
            : null,
      };
    });

    return {
      isRoot: access.isRoot,
      primaryRootEmail: PRIMARY_ROOT_EMAIL,
      subscribers: profileRows.length,
      activeSubscriptions: active.length,
      expiredSubscriptions: expired.length,
      mrr: active.reduce((sum, s) => sum + (s.price_cents ?? 0), 0) / 100,
      contentGenerated: contentRows.length,
      contentPosted: contentRows.filter((c) => c.status === "posted").length,
      impressions: contentRows.reduce((s, c) => s + (c.impressions ?? 0), 0),
      planSplit: ["starter", "growth", "scale"].map((plan) => ({
        plan,
        count: profileRows.filter((p) => p.plan === plan).length,
      })),
      billingCycleSplit: {
        monthly: active.filter((s) => s.billing_period !== "yearly").length,
        yearly: active.filter((s) => s.billing_period === "yearly").length,
      },
      subscriberRows,
      recentUsers: [...profileRows]
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
        .slice(0, 8),
      users: [...profileRows]
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
        .map((p) => ({
          ...p,
          roles: roleRows.filter((r) => r.user_id === p.id).map((r) => r.role as string),
        })),
      roles: roleRows,
    };
  });

const editSubscriberInput = z.object({
  userId: z.string().uuid(),
  plan: z.enum(["starter", "growth", "scale"]),
  status: z.enum(["active", "cancelled"]),
});

/**
 * Admin override for a subscriber's plan/status — e.g. comping an
 * account, manually extending access, or shutting one off without
 * going through Razorpay. Follows the same pattern already used for a
 * real plan switch: cancel every other live subscription for that user,
 * then write the new one, so "current plan" (derived from the newest
 * active/pending row, same as the user-facing plan page) stays
 * unambiguous. price_cents is 0 — this is an admin action, not a
 * payment.
 */
export const editSubscriber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => editSubscriberInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("subscriptions")
      .select("id")
      .eq("user_id", data.userId)
      .in("status", ["pending", "active"]);
    if (existingError) throw new Error(existingError.message);

    for (const row of existing ?? []) {
      const { error } = await supabaseAdmin
        .from("subscriptions")
        .update({ status: "cancelled" })
        .eq("id", row.id);
      if (error) throw new Error(error.message);
    }

    if (data.status === "active") {
      const { error } = await supabaseAdmin.from("subscriptions").insert({
        user_id: data.userId,
        plan: data.plan,
        price_cents: 0,
        billing_period: "monthly",
        payment_method: "admin",
        status: "active",
      } as never);
      if (error) throw new Error(error.message);
    }

    return { ok: true };
  });

export const grantRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => grantInput.parse(input))
  .handler(async ({ data, context }) => {
    const access = await assertAdmin(context);
    if (data.role === "root" && !access.isRoot) {
      throw new Error("Only root can grant root access");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = data.email.toLowerCase();

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    const { error } = await supabaseAdmin
      .from("user_roles")
      .upsert(
        { user_id: profile?.id ?? null, email, role: data.role },
        { onConflict: "email,role" },
      );
    if (error) throw new Error(error.message);

    return { ok: true, pending: !profile };
  });

export const revokeRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const access = await assertAdmin(context);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("user_roles")
      .select("email, role")
      .eq("id", data.id)
      .maybeSingle();

    if (row?.role === "root") {
      if (!access.isRoot) throw new Error("Only root can revoke root access");
      if (row.email.toLowerCase() === PRIMARY_ROOT_EMAIL) {
        throw new Error("The primary root account cannot be demoted");
      }
    }

    const { error } = await supabaseAdmin.from("user_roles").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertRoot(context);
    if (data.userId === context.userId) throw new Error("You cannot remove your own account");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("id", data.userId)
      .maybeSingle();

    if (profile?.email.toLowerCase() === PRIMARY_ROOT_EMAIL) {
      throw new Error("The primary root account cannot be removed");
    }

    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
