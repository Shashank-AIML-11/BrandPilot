import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, Link2, Loader2, Unlink } from "lucide-react";
import { CHANNELS } from "@/lib/channels/config";
import {
  disconnectChannel,
  listChannelConnections,
  startChannelAuth,
} from "@/lib/channels.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BlogPublishing } from "@/components/blog-publishing";

export function ChannelConnections({
  brandId,
  onConnections,
}: {
  brandId?: string | null;
  onConnections?: (connected: Array<{ channel: string; accountName: string }>) => void;
} = {}) {
  const queryClient = useQueryClient();
  const list = useServerFn(listChannelConnections);
  const start = useServerFn(startChannelAuth);
  const disconnect = useServerFn(disconnectChannel);

  const { data: connections = [], isLoading } = useQuery({
    queryKey: ["channel-connections", brandId ?? null],
    queryFn: () => list({ data: brandId ? { brandId } : {} }),
  });

  const byChannel = Object.fromEntries(connections.map((c) => [c.channel, c]));

  // Tell the page which channels are connected so it can fill the social handles.
  useEffect(() => {
    if (!onConnections || isLoading) return;
    onConnections(
      connections
        .filter((c) => c.connected)
        .map((c) => ({ channel: c.channel, accountName: c.accountName })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connections, isLoading]);

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

  const [pendingChannel, setPendingChannel] = useState<string | null>(null);

  const connect = useMutation({
    mutationFn: async (channel: string) => {
      setPendingChannel(channel);
      return start({ data: { channel, ...(brandId ? { brandId } : {}) } });
    },
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
    onError: (e) => {
      setPendingChannel(null);
      toast.error(e instanceof Error ? e.message : "Could not start the connection");
    },
  });

  const remove = useMutation({
    mutationFn: async (channel: string) =>
      disconnect({ data: { channel, ...(brandId ? { brandId } : {}) } }),
    onSuccess: () => {
      toast.success("Disconnected");
      void queryClient.invalidateQueries({ queryKey: ["channel-connections"] });
    },
  });

  return (
    <>
    <section className="surface space-y-4 p-6">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Channel connections
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect each network once for this brand — scheduled content then publishes automatically.
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
                    {conn?.connected ? (
                      <>
                        <span className="font-medium text-foreground/80">Social Handle:</span>{" "}
                        {conn.accountName}
                      </>
                    ) : (
                      channel.note
                    )}
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
                    disabled={connect.isPending && pendingChannel === channel.key}
                  >
                    {connect.isPending && pendingChannel === channel.key ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Link2 className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Connect
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Threads, Quora and Medium cannot be connected automatically. Add their handles above; content for them is prepared in LOVIZA and you post it manually.
      </p>
    </section>
    <BlogPublishing brandId={brandId} />
    </>
  );
}
