import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ChannelConnectionStatus } from "@/lib/channels/config";
import type { PublishResult } from "@/lib/channels/publishers.server";

function originFromRequest(): string {
  const origin = getRequestHeader("origin");
  if (origin) return origin.replace(/\/$/, "");
  const host = getRequestHeader("host") ?? "";
  const proto = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
  return `${proto}://${host}`;
}

/** Resolves which of the user's brands a channel action is for (defaults to the oldest). */
async function resolveBrandId(userId: string, brandId?: string): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { loadBrand } = await import("@/lib/brand.server");
  const brand = await loadBrand(supabaseAdmin as never, userId, brandId ?? null);
  return brand?.id ?? null;
}

export const listChannelConnections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { brandId?: string } | undefined) => input ?? {})
  .handler(async ({ data, context }): Promise<ChannelConnectionStatus[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const brandId = await resolveBrandId(context.userId, data.brandId);
    let query = supabaseAdmin
      .from("channel_connections")
      .select("channel, account_name, status, token_expires_at, meta")
      .eq("user_id", context.userId);
    if (brandId) query = query.eq("brand_id", brandId);
    const { data: rows } = await query;

    return ((rows ?? []) as unknown as Array<{
      channel: string;
      account_name: string;
      status: string;
      token_expires_at: string | null;
      meta: Record<string, unknown>;
    }>).map((row) => ({
      channel: row.channel,
      connected: row.status === "connected",
      accountName: row.account_name,
      status: row.status,
      expiresAt: row.token_expires_at,
      meta: Object.fromEntries(
        Object.entries(row.meta ?? {}).map(([k, v]) => [k, String(v ?? "")]),
      ),
    }));
  });

export const startChannelAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { channel: string; brandId?: string }) => {
    if (!input?.channel) throw new Error("Channel is required");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { buildAuthUrl } = await import("@/lib/channels/oauth.server");
    const brandId = await resolveBrandId(context.userId, data.brandId);
    const url = await buildAuthUrl({
      channel: data.channel,
      userId: context.userId,
      ...(brandId ? { brandId } : {}),
      origin: originFromRequest(),
    });
    return { url };
  });

export const disconnectChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { channel: string; brandId?: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const brandId = await resolveBrandId(context.userId, data.brandId);
    let del = supabaseAdmin
      .from("channel_connections")
      .delete()
      .eq("user_id", context.userId)
      .eq("channel", data.channel);
    if (brandId) del = del.eq("brand_id", brandId);
    await del;
    return { ok: true };
  });

export const publishContentItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { itemId: string; channels: string[] }) => {
    if (!input?.itemId) throw new Error("Content item is required");
    const channels = (input.channels ?? []).slice(0, 12);
    if (channels.length === 0) throw new Error("Select at least one channel");
    return { itemId: input.itemId, channels };
  })
  .handler(async ({ data, context }) => {
    const { publishItemToChannels } = await import("@/lib/channels/publish.server");
    return publishItemToChannels(context.userId, data.itemId, data.channels);
  });

export const publishAllContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { brandId?: string } | undefined) => input ?? {})
  .handler(async ({ data, context }) => {
    const { getGenerationEntitlement } = await import("@/lib/generation-entitlements");
    await getGenerationEntitlement(context.supabase, context.userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { CHANNELS_BY_TYPE } = await import("@/lib/content.server");
    const { loadBrand } = await import("@/lib/brand.server");

    const brand = await loadBrand(supabaseAdmin, context.userId, data.brandId);
    if (!brand) throw new Error("Create your brand profile first.");
    // Only text blogs are posted for now — infographic/video posting is on
    // hold while we validate the blog pipeline end-to-end.
    const today = new Date().toISOString().slice(0, 10);
    const { data: items, error: itemsError } = await supabaseAdmin
      .from("content_items")
      .select("id, scheduled_date")
      .eq("user_id", context.userId)
      .eq("brand_id", brand.id)
      .eq("type", "blog")
      .eq("enabled", true)
      .neq("status", "posted")
      .lte("scheduled_date", today)
      .order("scheduled_date", { ascending: true });
    if (itemsError) throw new Error(itemsError.message);

    const pending = (items ?? []) as Array<{ id: string; scheduled_date: string }>;
    if (pending.length === 0) {
      return { posted: 0, itemResults: [] as Array<{ itemId: string; results: PublishResult[] }> };
    }

    const { data: connectionsRaw } = await supabaseAdmin
      .from("channel_connections")
      .select("channel, status")
      .eq("user_id", context.userId)
      .eq("brand_id", brand.id)
      .eq("status", "connected");
    const connections = new Set(
      (connectionsRaw ?? []).map((c) => (c as unknown as { channel: string }).channel),
    );

    const handles = (brand?.social_handles as Record<string, string> | null) ?? {};
    const hasManualHandle = (channel: string) => Boolean((handles[channel] ?? "").trim());

    const blogChannels = CHANNELS_BY_TYPE["blog"] ?? [];
    const targets = blogChannels.filter((channel) =>
      channel === "Quora" || channel === "Medium"
        ? hasManualHandle(channel)
        : connections.has(channel),
    );

    if (targets.length === 0) {
      throw new Error(
        "No connected channels for blogs yet — connect LinkedIn or your Website in Brand Profile first.",
      );
    }

    const { publishItemToChannels } = await import("@/lib/channels/publish.server");
    const itemResults: Array<{ itemId: string; results: PublishResult[] }> = [];
    let posted = 0;
    for (const item of pending) {
      const { results } = await publishItemToChannels(context.userId, item.id, targets);
      itemResults.push({ itemId: item.id, results });
      if (results.some((r) => r.ok)) posted += 1;
    }

    return { posted, itemResults };
  });




/** "Sync now" on the Analytics page: pull the latest numbers for this user's posts. */
export const syncMyMetrics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { syncPostMetrics } = await import("@/lib/channels/metrics.server");
    return syncPostMetrics(supabaseAdmin as never, context.userId);
  });
