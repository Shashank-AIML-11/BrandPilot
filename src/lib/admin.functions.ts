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
  const roles = (data ?? []).map((r) => r.role as string);
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

export const getAdminStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const access = await assertAdmin(context);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [profiles, subs, content, roles] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, email, full_name, plan, created_at"),
      supabaseAdmin.from("subscriptions").select("plan, price_cents, status, created_at"),
      supabaseAdmin.from("content_items").select("id, status, type, impressions, clicks"),
      supabaseAdmin.from("user_roles").select("id, user_id, email, role, created_at"),
    ]);

    const subRows = subs.data ?? [];
    const active = subRows.filter((s) => s.status === "active");
    const contentRows = content.data ?? [];
    const profileRows = profiles.data ?? [];
    const roleRows = roles.data ?? [];

    return {
      isRoot: access.isRoot,
      primaryRootEmail: PRIMARY_ROOT_EMAIL,
      subscribers: profileRows.length,
      activeSubscriptions: active.length,
      mrr: active.reduce((sum, s) => sum + (s.price_cents ?? 0), 0) / 100,
      contentGenerated: contentRows.length,
      contentPosted: contentRows.filter((c) => c.status === "posted").length,
      impressions: contentRows.reduce((s, c) => s + (c.impressions ?? 0), 0),
      planSplit: ["starter", "growth", "scale"].map((plan) => ({
        plan,
        count: profileRows.filter((p) => p.plan === plan).length,
      })),
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
