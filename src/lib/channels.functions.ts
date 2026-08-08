import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ChannelConnectionStatus } from "@/lib/channels/config";

function originFromRequest(): string {
  const origin = getRequestHeader("origin");
  if (origin) return origin.replace(/\/$/, "");
  const host = getRequestHeader("host") ?? "";
  const proto = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
  return `${proto}://${host}`;
}

export const listChannelConnections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ChannelConnectionStatus[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("channel_connections")
      .select("channel, account_name, status, token_expires_at, meta")
      .eq("user_id", context.userId);

    return ((data ?? []) as unknown as Array<{
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
  .inputValidator((input: { channel: string }) => {
    if (!input?.channel) throw new Error("Channel is required");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { buildAuthUrl } = await import("@/lib/channels/oauth.server");
    const url = await buildAuthUrl({
      channel: data.channel,
      userId: context.userId,
      origin: originFromRequest(),
    });
    return { url };
  });

export const disconnectChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { channel: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("channel_connections")
      .delete()
      .eq("user_id", context.userId)
      .eq("channel", data.channel);
    return { ok: true };
  });

export const saveWebsiteEndpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { url: string; secret: string }) => {
    const url = (input?.url ?? "").trim();
    if (url && !/^https?:\/\//i.test(url)) throw new Error("Enter a full https:// URL");
    if (url.length > 500) throw new Error("URL is too long");
    return { url, secret: (input?.secret ?? "").trim().slice(0, 200) };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (!data.url) {
      await supabaseAdmin
        .from("channel_connections")
        .delete()
        .eq("user_id", context.userId)
        .eq("channel", "Website");
      return { ok: true };
    }
    const { encryptToken } = await import("@/lib/channels/crypto.server");
    const { error } = await supabaseAdmin.from("channel_connections").upsert(
      {
        user_id: context.userId,
        channel: "Website",
        account_id: data.url,
        account_name: new URL(data.url).host,
        access_token: await encryptToken(data.secret),
        refresh_token: "",
        scopes: "",
        meta: { url: data.url },
        status: "connected",
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "user_id,channel" },
    );
    if (error) throw new Error(error.message);
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
