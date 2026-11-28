import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

import { ROOT_EMAIL as PRIMARY_ROOT_EMAIL, isRootEmail } from "@/lib/root-email";

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
    if (isRootEmail(email)) {
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

export const getAutomationSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const access = await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getAutomationSetting } = await import("@/lib/app-settings.server");
    return {
      canEdit: access.isRoot,
      autoGenerate: await getAutomationSetting(supabaseAdmin as never, "auto_generate_enabled"),
      autopost: await getAutomationSetting(supabaseAdmin as never, "autopost_enabled"),
    };
  });

export const setAutomationSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        key: z.enum(["auto_generate_enabled", "autopost_enabled"]),
        value: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const access = await assertAdmin(context);
    if (!access.isRoot) throw new Error("Only root can change automation switches");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: authUser } = await context.supabase.auth.getUser();
    const { error } = await (supabaseAdmin as unknown as SupabaseClient)
      .from("app_settings")
      .upsert(
        {
          key: data.key,
          value: data.value,
          updated_at: new Date().toISOString(),
          updated_by: authUser.user?.email ?? context.userId,
        },
        { onConflict: "key" },
      );
    if (error) throw new Error(error.message);
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
      if (isRootEmail(row.email)) {
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

    if (isRootEmail(profile?.email)) {
      throw new Error("The primary root account cannot be removed");
    }

    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Recent generated posts with the brain's decisions: pillar, hook, angle, reason, editor score, poster design status. */
export const getGenerationDecisions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("content_items")
      .select("id, title, type, scheduled_date, created_at, brand_id, style_meta" as never)
      .not("style_meta" as never, "is", null)
      .order("created_at", { ascending: false })
      .limit(80);
    const rows = (data ?? []) as unknown as Array<{
      id: string;
      title: string | null;
      type: string;
      scheduled_date: string | null;
      created_at: string;
      brand_id: string | null;
      style_meta: Record<string, unknown> | null;
    }>;
    const ids = [...new Set(rows.map((r) => r.brand_id).filter((x): x is string => !!x))];
    const names = new Map<string, string>();
    if (ids.length) {
      const { data: brands } = await supabaseAdmin.from("brand_profiles").select("id, business_name").in("id", ids);
      for (const b of (brands ?? []) as unknown as Array<{ id: string; business_name?: string | null }>) names.set(b.id, b.business_name ?? "");
    }
    return {
      items: rows.map((r) => {
        const m = (r.style_meta ?? {}) as { pillar?: string; hook?: string; angle?: string; why?: string; recipe?: string; template?: string; design?: string; q?: { score?: number; fixed?: boolean; note?: string } };
        return {
          id: r.id,
          title: r.title ?? "",
          type: r.type,
          date: r.scheduled_date,
          brand: r.brand_id ? names.get(r.brand_id) ?? "" : "",
          pillar: m.pillar ?? "",
          hook: m.hook ?? "",
          angle: m.angle ?? "",
          why: m.why ?? "",
          recipe: m.recipe ?? "",
          template: m.template ?? "",
          design: m.design ?? "",
          score: m.q?.score ?? null,
          rewritten: !!m.q?.fixed,
          note: m.q?.note ?? "",
        };
      }),
    };
  });

type Check = { label: string; status: "ok" | "warn" | "bad"; detail: string };

/** Pre-flight check before generating a week: is each brand's profile, photos, Brain and footage ready, and are the services switched on. */
export const getBrandReadiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ search: z.string().max(80).optional() }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { posterComposerEnabled } = await import("@/lib/content.server");

    let q = supabaseAdmin.from("brand_profiles").select("*").order("updated_at", { ascending: false }).limit(12);
    if (data.search?.trim()) q = q.ilike("business_name", `%${data.search.trim()}%`);
    const { data: brands } = await q;

    const set = (k: string) => Boolean(process.env[k]?.trim());
    const services: Check[] = [
      { label: "Text writer key (OpenRouter or Groq)", status: set("OPENROUTER_API_KEY") || set("GROQ_API_KEY") ? "ok" : "bad", detail: "" },
      { label: "Image generator key (fal)", status: set("FAL_KEY") ? "ok" : "bad", detail: "needed when no stock or own photo fits" },
      { label: "Video renderer key (Shotstack)", status: set("SHOTSTACK_API_KEY") ? "ok" : "bad", detail: "needed for reels" },
      { label: "Pixabay key", status: set("PIXABAY_API_KEY") ? "ok" : "warn", detail: "stock clips and photos" },
      { label: "Pexels key", status: set("PEXELS_API_KEY") ? "ok" : "warn", detail: "optional second clip source" },
      { label: "Poster text design", status: posterComposerEnabled() ? "ok" : "bad", detail: posterComposerEnabled() ? "on" : "POSTER_COMPOSER is off, posters will have no text" },
      { label: "Brain director", status: process.env["BRAIN_DIRECTOR"] === "off" ? "warn" : "ok", detail: process.env["BRAIN_DIRECTOR"] === "off" ? "off, rotation only" : "on" },
    ];

    const profileFields = [
      "business_name", "website", "description", "products_services", "icp", "propositions", "tone", "keywords",
      "industry", "current_offers", "testimonials", "competitors", "locations", "languages", "voice_dos_donts", "compliance_notes",
    ];

    const result = [];
    for (const b of (brands ?? []) as unknown as Array<Record<string, unknown>>) {
      const id = String(b["id"]);
      const uid = String(b["user_id"]);
      const filled = profileFields.filter((f) => String(b[f] ?? "").trim().length > 0);
      const missing = profileFields.filter((f) => !filled.includes(f));
      const bucket = supabaseAdmin.storage.from("content-media");
      const count = async (folder: string) =>
        ((await bucket.list(`${uid}/brand/${id}/${folder}`, { limit: 100 })).data ?? []).filter((f) => /\.(png|jpe?g|webp)$/i.test(f.name)).length;
      const [hero, assets] = await Promise.all([count("products"), count("assets")]);
      const [pb, know, broll, failed] = await Promise.all([
        supabaseAdmin.from("brand_playbooks" as never).select("playbook, updated_at, source_updated_at").eq("brand_id", id).maybeSingle(),
        supabaseAdmin.from("brand_knowledge" as never).select("id", { count: "exact", head: true }).eq("brand_id" as never, id as never),
        supabaseAdmin.from("brand_media" as never).select("id", { count: "exact", head: true }).eq("brand_id", id).eq("kind", "broll"),
        supabaseAdmin
          .from("content_items")
          .select("id", { count: "exact", head: true })
          .eq("brand_id", id)
          .eq("status", "failed")
          .gte("created_at", new Date(Date.now() - 14 * 86_400_000).toISOString()),
      ]);
      const pbRow = pb.data as unknown as { playbook?: { pillars?: unknown[]; photo_subjects?: unknown[] }; source_updated_at?: string | null } | null;
      const pillars = pbRow?.playbook?.pillars?.length ?? 0;
      const stale = !!pbRow?.source_updated_at && new Date(pbRow.source_updated_at).getTime() < new Date(String(b["updated_at"])).getTime();
      const brollCount = (broll as { count: number | null }).count ?? 0;
      const knowCount = (know as { count: number | null }).count ?? 0;
      const failedCount = (failed as { count: number | null }).count ?? 0;

      const checks: Check[] = [
        {
          label: "Brand Profile",
          status: filled.length >= 13 ? "ok" : filled.length >= 9 ? "warn" : "bad",
          detail: `${filled.length} of ${profileFields.length} fields filled${missing.length ? `. Empty: ${missing.join(", ")}` : ""}`,
        },
        { label: "Hero product photos", status: hero >= 3 ? "ok" : hero >= 1 ? "warn" : "bad", detail: `${hero} uploaded (3 or more recommended)` },
        { label: "Brand Assets images", status: assets > 0 ? "ok" : "warn", detail: `${assets} uploaded` },
        { label: "Brand documents read by the Brain", status: knowCount > 0 ? "ok" : "warn", detail: `${knowCount} item(s)` },
        {
          label: "Playbook",
          status: pillars >= 5 && !stale ? "ok" : pillars >= 5 ? "warn" : "bad",
          detail: pillars ? `${pillars} pillars${stale ? ", older than the latest profile edit (rebuilds on the next generation)" : ", up to date"}` : "not built yet: save the Brand Profile",
        },
        { label: "Footage library", status: brollCount >= 8 ? "ok" : brollCount >= 1 ? "warn" : "warn", detail: `${brollCount} clip(s) ready (8 or more is good)` },
        { label: "Failed pieces, last 14 days", status: failedCount === 0 ? "ok" : "warn", detail: String(failedCount) },
      ];
      result.push({ id, name: String(b["business_name"] ?? ""), industry: String(b["industry"] ?? ""), checks });
    }
    return { services, brands: result };
  });
