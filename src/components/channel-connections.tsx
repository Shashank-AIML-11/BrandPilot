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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  // TikTok is banned in India, so say so next to the button instead of starting a login that cannot work.
  const [blockedNote, setBlockedNote] = useState<string | null>(null);
  const inIndia = () => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return tz === "Asia/Calcutta" || tz === "Asia/Kolkata";
    } catch {
      return false;
    }
  };
  useEffect(() => {
    if (!blockedNote) return;
    const t = window.setTimeout(() => setBlockedNote(null), 5000);
    return () => window.clearTimeout(t);
  }, [blockedNote]);

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

  const [confirmDisconnect, setConfirmDisconnect] = useState<string | null>(null);
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {CHANNELS.filter((c) => c.kind === "oauth").map((channel) => {
            const conn = byChannel[channel.key];
            const needsReconnect = conn?.status === "needs_reconnect";
            const daysLeft = conn?.expiresAt
              ? Math.ceil((Date.parse(conn.expiresAt) - Date.now()) / 86_400_000)
              : null;
            const expiringSoon = Boolean(conn?.connected && daysLeft !== null && daysLeft <= 7);
            return (
              <div
                key={channel.key}
                className="flex items-start justify-between gap-3 rounded-lg border border-border p-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{channel.label}</span>
                    {conn?.connected && (
                      <Badge variant="outline" className="gap-1 border-primary/40 text-primary">
                        <CheckCircle2 className="h-3 w-3" /> Connected
                      </Badge>
                    )}
                  </div>
                  {needsReconnect && (
                    <p className="mt-1 text-xs font-medium text-destructive">
                      Login expired. Press Connect to sign in again, otherwise posts to {channel.label} will fail.
                    </p>
                  )}
                  {expiringSoon && (
                    <p className="mt-1 text-xs font-medium text-amber-500">
                      {daysLeft! <= 0
                        ? "Login has expired. Disconnect and connect again."
                        : `Login expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}. Disconnect and connect again to renew it.`}
                    </p>
                  )}
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
                    onClick={() => setConfirmDisconnect(channel.key)}
                    disabled={remove.isPending}
                    aria-label={`Disconnect ${channel.label}`}
                    title={`Disconnect ${channel.label}`}
                  >
                    <Unlink className="h-4 w-4" />
                  </Button>
                ) : (
                  <div className="flex shrink-0 items-center gap-2">
                    {blockedNote === channel.key && (
                      <span role="status" className="max-w-[10rem] text-right text-xs font-medium text-destructive">
                        {channel.label} is not available in India
                      </span>
                    )}
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        if (channel.key === "TikTok" && inIndia()) {
                          setBlockedNote(channel.key);
                          return;
                        }
                        connect.mutate(channel.key);
                      }}
                      disabled={connect.isPending && pendingChannel === channel.key}
                    >
                      {connect.isPending && pendingChannel === channel.key ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Link2 className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      Connect
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

    </section>
    <AlertDialog open={confirmDisconnect !== null} onOpenChange={(o) => !o && setConfirmDisconnect(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Disconnect {CHANNELS.find((c) => c.key === confirmDisconnect)?.label ?? "this channel"}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            LOVIZA will stop posting to this account. You can connect it again at any time.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (confirmDisconnect) remove.mutate(confirmDisconnect);
              setConfirmDisconnect(null);
            }}
          >
            Disconnect
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <BlogPublishing brandId={brandId} />
    </>
  );
}
