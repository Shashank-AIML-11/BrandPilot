import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Unlink } from "lucide-react";
import {
  disconnectChannel,
  listChannelConnections,
  saveBlogSite,
  saveMediumToken,
} from "@/lib/channels.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

const PLATFORMS: Record<string, { label: string; help: string }> = {
  wordpress: {
    label: "WordPress",
    help: "Site address + your username + an Application Password (WordPress > Users > Profile > Application Passwords).",
  },
  ghost: { label: "Ghost", help: "Site address + Admin API key (Ghost Admin > Settings > Integrations > Add custom integration)." },
  webflow: {
    label: "Webflow",
    help: "Site address + API token (Site settings > Apps & integrations) + your Blog Collection ID (CMS > Blog > Collection settings).",
  },
  shopify: {
    label: "Shopify",
    help: "Store address (mystore.myshopify.com) + Admin API access token with write_content permission (a custom app).",
  },
  webhook: { label: "Custom website (endpoint)", help: "Your site receives each blog at an address you provide, signed with a shared secret." },
  hosted: {
    label: "Wix / Squarespace / other (LOVIZA-hosted blog)",
    help: "No keys needed. LOVIZA hosts your blog page and RSS feed; link or embed it from any site, or import the RSS.",
  },
};

export function BlogPublishing({ brandId }: { brandId?: string | null }) {
  const queryClient = useQueryClient();
  const list = useServerFn(listChannelConnections);
  const saveSite = useServerFn(saveBlogSite);
  const saveMedium = useServerFn(saveMediumToken);
  const disconnect = useServerFn(disconnectChannel);

  const { data: connections = [] } = useQuery({
    queryKey: ["channel-connections", brandId ?? null],
    queryFn: () => list({ data: brandId ? { brandId } : {} }),
  });
  const website = connections.find((c) => c.channel === "Website" && c.connected);
  const medium = connections.find((c) => c.channel === "Medium" && c.connected);

  const [platform, setPlatform] = useState("wordpress");
  const [url, setUrl] = useState("");
  const [username, setUsername] = useState("");
  const [secret, setSecret] = useState("");
  const [collectionId, setCollectionId] = useState("");
  const [mediumToken, setMediumToken] = useState("");

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["channel-connections"] });
  const extra = brandId ? { brandId } : {};

  const save = useMutation({
    mutationFn: () => saveSite({ data: { ...extra, platform, url, username, secret, collectionId } }),
    onSuccess: ({ url: u }) => {
      toast.success(platform === "hosted" ? `Hosted blog ready: ${u}` : "Website connected — blogs will publish there");
      setSecret("");
      void refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not connect"),
  });
  const saveTok = useMutation({
    mutationFn: () => saveMedium({ data: { ...extra, token: mediumToken } }),
    onSuccess: () => {
      toast.success("Medium connected");
      setMediumToken("");
      void refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not connect Medium"),
  });
  const remove = useMutation({
    mutationFn: (channel: string) => disconnect({ data: { channel, ...extra } }),
    onSuccess: () => void refresh(),
  });

  const connectedPlatform = website?.meta["platform"] ?? "webhook";
  const needsUrl = platform !== "hosted";

  return (
    <section className="surface space-y-5 p-6">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Blog publishing</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          LOVIZA blogs go to your website's blog section, plus LinkedIn, Medium and Quora.
        </p>
      </div>

      <div className="space-y-3 rounded-lg border border-border p-4">
        <div className="flex items-center gap-2">
          <span className="font-medium">Your website blog</span>
          {website && (
            <Badge variant="outline" className="gap-1 border-primary/40 text-primary">
              <CheckCircle2 className="h-3 w-3" /> {PLATFORMS[connectedPlatform]?.label ?? "Connected"}
            </Badge>
          )}
        </div>

        {website ? (
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-muted-foreground">
              {connectedPlatform === "hosted" ? (
                <>
                  Hosted blog:{" "}
                  <a className="text-primary underline" href={website.meta["url"]} target="_blank" rel="noreferrer">
                    {website.meta["url"]}
                  </a>{" "}
                  (add <code>?format=rss</code> for the RSS feed)
                </>
              ) : (
                <>Publishing to {website.accountName}</>
              )}
            </span>
            <Button size="sm" variant="ghost" onClick={() => remove.mutate("Website")} disabled={remove.isPending}>
              <Unlink className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <>
            <div>
              <Label className="text-xs">Website platform</Label>
              <select
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
              >
                {Object.entries(PLATFORMS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">{PLATFORMS[platform]?.help}</p>
            </div>
            {needsUrl && (
              <div>
                <Label className="text-xs">{platform === "shopify" ? "Store address" : platform === "webhook" ? "Endpoint address" : "Site address"}</Label>
                <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={platform === "shopify" ? "mystore.myshopify.com" : "https://www.yourbrand.com"} />
              </div>
            )}
            {platform === "wordpress" && (
              <div>
                <Label className="text-xs">WordPress username</Label>
                <Input value={username} onChange={(e) => setUsername(e.target.value)} />
              </div>
            )}
            {platform === "webflow" && (
              <div>
                <Label className="text-xs">Blog Collection ID</Label>
                <Input value={collectionId} onChange={(e) => setCollectionId(e.target.value)} />
              </div>
            )}
            {needsUrl && (
              <div>
                <Label className="text-xs">
                  {platform === "wordpress" ? "Application password" : platform === "webhook" ? "Shared secret (optional)" : platform === "ghost" ? "Admin API key" : "API token"}
                </Label>
                <Input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="off" />
              </div>
            )}
            <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {platform === "hosted" ? "Create hosted blog" : "Test & connect"}
            </Button>
          </>
        )}
      </div>

      <div className="space-y-3 rounded-lg border border-border p-4">
        <div className="flex items-center gap-2">
          <span className="font-medium">Medium</span>
          {medium && (
            <Badge variant="outline" className="gap-1 border-primary/40 text-primary">
              <CheckCircle2 className="h-3 w-3" /> {medium.accountName}
            </Badge>
          )}
        </div>
        {medium ? (
          <Button size="sm" variant="ghost" onClick={() => remove.mutate("Medium")}>
            <Unlink className="mr-1.5 h-4 w-4" /> Disconnect
          </Button>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Optional. Paste a Medium integration token (Medium > Settings > Security and apps) to post automatically.
              Medium no longer issues new tokens to everyone — without one, blogs are prepared for you to post by hand.
            </p>
            <div className="flex gap-2">
              <Input type="password" value={mediumToken} onChange={(e) => setMediumToken(e.target.value)} placeholder="Integration token" autoComplete="off" />
              <Button size="sm" variant="secondary" onClick={() => saveTok.mutate()} disabled={saveTok.isPending || !mediumToken}>
                {saveTok.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Connect
              </Button>
            </div>
          </>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Quora has no posting API, so Quora answers are prepared in LOVIZA for you to post. LinkedIn is connected above.
      </p>
    </section>
  );
}
