import { createFileRoute } from "@tanstack/react-router";
import { OAUTH_CHANNELS } from "@/lib/channels/config";

export const Route = createFileRoute("/api/public/oauth/$channel")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const channel = OAUTH_CHANNELS.find(
          (c) => c.toLowerCase() === params.channel.toLowerCase(),
        );
        const url = new URL(request.url);
        const back = (query: string) =>
          new Response(null, {
            status: 302,
            headers: { location: `${url.origin}/brand-profile?${query}` },
          });

        if (!channel) return back("channel_error=Unknown+channel");

        const providerError = url.searchParams.get("error_description") ?? url.searchParams.get("error");
        if (providerError) return back(`channel_error=${encodeURIComponent(providerError)}`);

        const code = url.searchParams.get("code");
        const rawState = url.searchParams.get("state");
        if (!code || !rawState) return back("channel_error=Missing+authorization+code");

        const { unpackState, exchangeCode, describeAccount, saveConnection } = await import(
          "@/lib/channels/oauth.server"
        );
        const state = await unpackState(rawState);
        if (!state || state.channel !== channel) {
          return back("channel_error=This+connection+link+expired.+Please+try+again.");
        }

        try {
          const token = await exchangeCode({
            channel,
            code,
            origin: state.origin,
            ...(state.verifier ? { verifier: state.verifier } : {}),
          });
          const account = await describeAccount(channel, token.accessToken);
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          await saveConnection(supabaseAdmin as never, {
            userId: state.userId,
            channel,
            accessToken: account.token ?? token.accessToken,
            refreshToken: token.refreshToken,
            expiresIn: token.expiresIn,
            scope: token.scope,
            accountId: account.accountId,
            accountName: account.accountName,
            meta: account.meta,
          });

          return back(`channel_connected=${encodeURIComponent(channel)}`);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Connection failed";
          console.error(`[oauth:${channel}]`, message);
          return back(`channel_error=${encodeURIComponent(message.slice(0, 300))}`);
        }
      },
    },
  },
});
