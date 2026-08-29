import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, Link2, Loader2, Unlink } from "lucide-react";
import { CHANNELS } from "@/lib/channels/config";
import {
  disconnectChannel,
  listChannelConnections,
  saveWebsiteEndpoint,
  startChannelAuth,
} from "@/lib/channels.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export function ChannelConnections() {
  const queryClient = useQueryClient();
  const list = useServerFn(listChannelConnections);
  const start = useServerFn(startChannelAuth);
  const disconnect = useServerFn(disconnectChannel);
  const saveSite = useServerFn(saveWebsiteEndpoint);

  const [siteUrl, setSiteUrl] = useState("");
  const [siteSecret, setSiteSecret] = useState("");

  const { data: connections = [], isLoading } = useQuery({
    queryKey: ["channel-connections"],
    queryFn: () => list({}),
  });

  const byChannel = Object.fromEntries(connections.map((c) => [c.channel, c]));

  useEffect(() => {
    const site = byChannel["Website"];
    if (site && !siteUrl) setSiteUrl(String(site.meta["url"] ?? ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connections.length]);

  // Surface the OAuth callback outcome once we land back on this page.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("channel_connected");
    const error = params.get("channel_error");
    if (connected) toast.success(`${connected} connected`);
    if (error) toast.error(error);
    if (connected || error) {
      void queryClient.invalidateQueries({ queryKey: ["channel-connections"] });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [queryClient]);

  const connect = useMutation({
    mutationFn: async (channel: string) => start({ data: { channel } }),
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not start the connection"),
  });

  const remove = useMutation({
    mutationFn: async (channel: string) => disconnect({ data: { channel } }),
    onSuccess: () => {
      toast.success("Disconnected");
      void queryClient.invalidateQueries({ queryKey: ["channel-connections"] });
    },
  });

  const saveWebsite = useMutation({
    mutationFn: async () => saveSite({ data: { url: siteUrl, secret: siteSecret } }),
    onSuccess: () => {
      toast.success(siteUrl ? "Website endpoint saved" : "Website endpoint removed");
      setSiteSecret("");
      void queryClient.invalidateQueries({ queryKey: ["channel-connections"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save"),
  });

  return (
    <section className="surface space-y-4 p-6">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Channel connections
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect each network once — scheduled content then publishes automatically.
        </p>
      </div>

      {isLoading ? (
        <div className="flex h-20 items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {CHANNELS.filter((c) => c.kind === "oauth").map((channel) => {
            const conn = byChannel[channel.key];
            return (
              <div
                key={channel.key}
                className="flex items-start justify-between gap-3 rounded-lg border border-border p-4"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{channel.label}</span>
                    {conn?.connected && (
                      <Badge variant="outline" className="gap-1 border-primary/40 text-primary">
                        <CheckCircle2 className="h-3 w-3" /> Connected
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {conn?.connected ? conn.accountName : channel.note}
                  </p>
                </div>
                {conn?.connected ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => remove.mutate(channel.key)}
                    disabled={remove.isPending}
                  >
                    <Unlink className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => connect.mutate(channel.key)}
                    disabled={connect}
                  >
                    <Link2 className="mr-1.5 h-3.5 w-3.5" /> Connect
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="space-y-3 rounded-lg border border-border p-4">
        <div>
          <p className="font-medium">Website</p>
          <p className="text-xs text-muted-foreground">
            Blogs are POSTed as JSON to this endpoint, signed with your secret in the{" "}
            <code>x-LOVIZA-signature</code> header.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="site-endpoint">Publish endpoint</Label>
            <Input
              id="site-endpoint"
              placeholder="https://acme.com/api/blog-webhook"
              value={siteUrl}
              onChange={(e) => setSiteUrl(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="site-secret">Shared secret</Label>
            <Input
              id="site-secret"
              type="password"
              placeholder="••••••••"
              value={siteSecret}
              onChange={(e) => setSiteSecret(e.target.value)}
            />
          </div>
        </div>
        <Button size="sm" onClick={() => saveWebsite.mutate()} disabled={saveWebsite.isPending}>
          Save website endpoint
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Quora and Medium have no public posting API — publishing there is recorded in LOVIZA so
        your calendar stays accurate, and you post the prepared content manually.
      </p>
    </section>
  );
}
