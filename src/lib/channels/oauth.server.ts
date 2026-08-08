/** OAuth wiring for every social channel. Server-only. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { encryptToken, decryptToken, packState, unpackState, pkce } from "./crypto.server";

type Admin = SupabaseClient<never, never, never>;

export interface ProviderConfig {
  channel: string;
  authUrl: string;
  tokenUrl: string;
  scope: string;
  idEnv: string;
  secretEnv: string;
  usesPkce?: boolean;
  basicAuth?: boolean;
  extraAuthParams?: Record<string, string>;
}

export const PROVIDERS: Record<string, ProviderConfig> = {
  LinkedIn: {
    channel: "LinkedIn",
    authUrl: "https://www.linkedin.com/oauth/v2/authorization",
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    scope: "openid profile email w_member_social",
    idEnv: "LINKEDIN_CLIENT_ID",
    secretEnv: "LINKEDIN_CLIENT_SECRET",
  },
  YouTube: {
    channel: "YouTube",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scope:
      "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly",
    idEnv: "GOOGLE_OAUTH_CLIENT_ID",
    secretEnv: "GOOGLE_OAUTH_CLIENT_SECRET",
    extraAuthParams: { access_type: "offline", prompt: "consent", include_granted_scopes: "true" },
  },
  Facebook: {
    channel: "Facebook",
    authUrl: "https://www.facebook.com/v21.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v21.0/oauth/access_token",
    scope: "pages_show_list,pages_manage_posts,pages_read_engagement,business_management",
    idEnv: "META_APP_ID",
    secretEnv: "META_APP_SECRET",
  },
  Instagram: {
    channel: "Instagram",
    authUrl: "https://www.facebook.com/v21.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v21.0/oauth/access_token",
    scope:
      "pages_show_list,instagram_basic,instagram_content_publish,pages_read_engagement,business_management",
    idEnv: "META_APP_ID",
    secretEnv: "META_APP_SECRET",
  },
  X: {
    channel: "X",
    authUrl: "https://twitter.com/i/oauth2/authorize",
    tokenUrl: "https://api.twitter.com/2/oauth2/token",
    scope: "tweet.read tweet.write users.read offline.access media.write",
    idEnv: "X_CLIENT_ID",
    secretEnv: "X_CLIENT_SECRET",
    usesPkce: true,
    basicAuth: true,
  },
  Pinterest: {
    channel: "Pinterest",
    authUrl: "https://www.pinterest.com/oauth/",
    tokenUrl: "https://api.pinterest.com/v5/oauth/token",
    scope: "boards:read,boards:write,pins:read,pins:write,user_accounts:read",
    idEnv: "PINTEREST_APP_ID",
    secretEnv: "PINTEREST_APP_SECRET",
    basicAuth: true,
  },
  TikTok: {
    channel: "TikTok",
    authUrl: "https://www.tiktok.com/v2/auth/authorize/",
    tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/",
    scope: "user.info.basic,video.publish,video.upload",
    idEnv: "TIKTOK_CLIENT_KEY",
    secretEnv: "TIKTOK_CLIENT_SECRET",
  },
};

export const redirectUri = (origin: string, channel: string) =>
  `${origin}/api/public/oauth/${channel.toLowerCase()}`;

export function credentials(provider: ProviderConfig) {
  const clientId = process.env[provider.idEnv];
  const clientSecret = process.env[provider.secretEnv];
  if (!clientId || !clientSecret) {
    throw new Error(
      `${provider.channel} is not set up yet — the app owner must add ${provider.idEnv} and ${provider.secretEnv}.`,
    );
  }
  return { clientId, clientSecret };
}

export async function buildAuthUrl(input: {
  channel: string;
  userId: string;
  origin: string;
}): Promise<string> {
  const provider = PROVIDERS[input.channel];
  if (!provider) throw new Error(`${input.channel} does not support automatic posting.`);
  const { clientId } = credentials(provider);

  const pair = provider.usesPkce ? await pkce() : null;
  const state = await packState({
    userId: input.userId,
    channel: input.channel,
    origin: input.origin,
    ...(pair ? { verifier: pair.verifier } : {}),
    exp: Date.now() + 15 * 60 * 1000,
  });

  const params = new URLSearchParams({
    response_type: "code",
    client_id: provider.channel === "TikTok" ? "" : clientId,
    redirect_uri: redirectUri(input.origin, input.channel),
    state,
    ...(provider.extraAuthParams ?? {}),
  });
  if (provider.channel === "TikTok") {
    params.delete("client_id");
    params.set("client_key", clientId);
    params.set("scope", provider.scope);
  } else {
    params.set("scope", provider.scope);
  }
  if (pair) {
    params.set("code_challenge", pair.challenge);
    params.set("code_challenge_method", "S256");
  }

  return `${provider.authUrl}${provider.authUrl.includes("?") ? "&" : "?"}${params.toString()}`;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  data?: { access_token?: string; refresh_token?: string; expires_in?: number };
}

export async function exchangeCode(input: {
  channel: string;
  code: string;
  origin: string;
  verifier?: string;
}) {
  const provider = PROVIDERS[input.channel]!;
  const { clientId, clientSecret } = credentials(provider);

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: redirectUri(input.origin, input.channel),
  });
  const headers: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded",
  };

  if (provider.basicAuth) {
    headers["authorization"] = `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
    if (provider.usesPkce) body.set("client_id", clientId);
  } else if (provider.channel === "TikTok") {
    body.set("client_key", clientId);
    body.set("client_secret", clientSecret);
  } else {
    body.set("client_id", clientId);
    body.set("client_secret", clientSecret);
  }
  if (input.verifier) body.set("code_verifier", input.verifier);

  const response = await fetch(provider.tokenUrl, { method: "POST", headers, body });
  const text = await response.text();
  if (!response.ok) throw new Error(`${input.channel} token exchange failed: ${text}`);

  const json = JSON.parse(text) as TokenResponse;
  const payload = json.data ?? json;
  const accessToken = payload.access_token ?? "";
  if (!accessToken) throw new Error(`${input.channel} did not return an access token.`);

  return {
    accessToken,
    refreshToken: payload.refresh_token ?? "",
    expiresIn: payload.expires_in ?? 0,
    scope: json.scope ?? provider.scope,
  };
}

/** Provider-specific account discovery — what we actually post to. */
export async function describeAccount(
  channel: string,
  accessToken: string,
): Promise<{ accountId: string; accountName: string; meta: Record<string, unknown>; token?: string }> {
  const call = async (url: string, init?: RequestInit) => {
    const res = await fetch(url, {
      ...init,
      headers: { authorization: `Bearer ${accessToken}`, ...(init?.headers ?? {}) },
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${channel} account lookup failed: ${text}`);
    return JSON.parse(text) as Record<string, never>;
  };

  if (channel === "LinkedIn") {
    const me = (await call("https://api.linkedin.com/v2/userinfo")) as unknown as {
      sub: string;
      name?: string;
    };
    return { accountId: me.sub, accountName: me.name ?? "LinkedIn member", meta: {} };
  }

  if (channel === "YouTube") {
    const res = (await call(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
    )) as unknown as { items?: Array<{ id: string; snippet?: { title?: string } }> };
    const channelInfo = res.items?.[0];
    return {
      accountId: channelInfo?.id ?? "",
      accountName: channelInfo?.snippet?.title ?? "YouTube channel",
      meta: {},
    };
  }

  if (channel === "Facebook" || channel === "Instagram") {
    const res = (await call(
      "https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,instagram_business_account",
    )) as unknown as {
      data?: Array<{
        id: string;
        name: string;
        access_token: string;
        instagram_business_account?: { id: string };
      }>;
    };
    const page =
      channel === "Instagram"
        ? res.data?.find((p) => p.instagram_business_account?.id)
        : res.data?.[0];
    if (!page) {
      throw new Error(
        channel === "Instagram"
          ? "No Instagram Business account is linked to your Facebook Pages."
          : "No Facebook Page found on this account.",
      );
    }
    return {
      accountId:
        channel === "Instagram" ? (page.instagram_business_account?.id ?? "") : page.id,
      accountName: page.name,
      meta: { pageId: page.id },
      token: page.access_token,
    };
  }

  if (channel === "X") {
    const me = (await call("https://api.twitter.com/2/users/me")) as unknown as {
      data?: { id: string; username?: string };
    };
    return {
      accountId: me.data?.id ?? "",
      accountName: me.data?.username ? `@${me.data.username}` : "X account",
      meta: {},
    };
  }

  if (channel === "Pinterest") {
    const me = (await call("https://api.pinterest.com/v5/user_account")) as unknown as {
      username?: string;
    };
    const boards = (await call("https://api.pinterest.com/v5/boards?page_size=1")) as unknown as {
      items?: Array<{ id: string; name: string }>;
    };
    return {
      accountId: me.username ?? "pinterest",
      accountName: me.username ? `@${me.username}` : "Pinterest",
      meta: { boardId: boards.items?.[0]?.id ?? "", boardName: boards.items?.[0]?.name ?? "" },
    };
  }

  if (channel === "TikTok") {
    const me = (await call(
      "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name",
    )) as unknown as { data?: { user?: { open_id?: string; display_name?: string } } };
    return {
      accountId: me.data?.user?.open_id ?? "",
      accountName: me.data?.user?.display_name ?? "TikTok",
      meta: {},
    };
  }

  return { accountId: "", accountName: channel, meta: {} };
}

export async function saveConnection(
  admin: Admin,
  input: {
    userId: string;
    channel: string;
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    scope: string;
    accountId: string;
    accountName: string;
    meta: Record<string, unknown>;
  },
) {
  const { error } = await admin.from("channel_connections").upsert(
    {
      user_id: input.userId,
      channel: input.channel,
      account_id: input.accountId,
      account_name: input.accountName,
      access_token: await encryptToken(input.accessToken),
      refresh_token: await encryptToken(input.refreshToken),
      token_expires_at: input.expiresIn
        ? new Date(Date.now() + input.expiresIn * 1000).toISOString()
        : null,
      scopes: input.scope,
      meta: input.meta,
      status: "connected",
      updated_at: new Date().toISOString(),
    } as never,
    { onConflict: "user_id,channel" },
  );
  if (error) throw new Error(error.message);
}

export interface LiveConnection {
  channel: string;
  accessToken: string;
  accountId: string;
  accountName: string;
  meta: Record<string, unknown>;
}

/** Reads a connection and refreshes the access token when it is close to expiring. */
export async function liveConnection(
  admin: Admin,
  userId: string,
  channel: string,
): Promise<LiveConnection | null> {
  const { data } = await admin
    .from("channel_connections")
    .select("*")
    .eq("user_id", userId)
    .eq("channel", channel)
    .maybeSingle();
  const row = data as unknown as {
    access_token: string;
    refresh_token: string;
    token_expires_at: string | null;
    account_id: string;
    account_name: string;
    meta: Record<string, unknown>;
  } | null;
  if (!row) return null;

  let accessToken = await decryptToken(row.access_token);
  const refreshToken = await decryptToken(row.refresh_token);
  const expiresAt = row.token_expires_at ? Date.parse(row.token_expires_at) : 0;
  const provider = PROVIDERS[channel];

  if (provider && refreshToken && expiresAt && expiresAt - Date.now() < 5 * 60 * 1000) {
    const { clientId, clientSecret } = credentials(provider);
    const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken });
    const headers: Record<string, string> = {
      "content-type": "application/x-www-form-urlencoded",
    };
    if (provider.basicAuth) headers["authorization"] = `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
    else if (provider.channel === "TikTok") {
      body.set("client_key", clientId);
      body.set("client_secret", clientSecret);
    } else {
      body.set("client_id", clientId);
      body.set("client_secret", clientSecret);
    }

    const res = await fetch(provider.tokenUrl, { method: "POST", headers, body });
    if (res.ok) {
      const json = (await res.json()) as TokenResponse;
      const payload = json.data ?? json;
      if (payload.access_token) {
        accessToken = payload.access_token;
        await admin
          .from("channel_connections")
          .update({
            access_token: await encryptToken(accessToken),
            refresh_token: await encryptToken(payload.refresh_token || refreshToken),
            token_expires_at: payload.expires_in
              ? new Date(Date.now() + payload.expires_in * 1000).toISOString()
              : null,
          } as never)
          .eq("user_id", userId)
          .eq("channel", channel);
      }
    } else {
      await admin
        .from("channel_connections")
        .update({ status: "needs_reconnect" } as never)
        .eq("user_id", userId)
        .eq("channel", channel);
    }
  }

  return {
    channel,
    accessToken,
    accountId: row.account_id,
    accountName: row.account_name,
    meta: row.meta ?? {},
  };
}

export { unpackState };
