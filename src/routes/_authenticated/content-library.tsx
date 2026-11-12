import { useBrandScope } from "@/lib/brand-scope";
import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { toast } from "sonner";
import { Loader2, ImageOff, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { publishContentItem } from "@/lib/channels.functions";
import { cachedMediaUrl } from "@/lib/media";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ContentDetailDialog,
  typeStyles,
  type ContentItem,
} from "@/components/content-detail-dialog";

export const Route = createFileRoute("/_authenticated/content-library")({
  head: () => ({
    meta: [
      { title: "Content Library — LOVIZA" },
      {
        name: "description",
        content:
          "Every piece LOVIZA has generated, organized by format — posts, reels, carousels, YouTube Shorts, video and blog.",
      },
    ],
  }),
  component: ContentLibraryPage,
});

/**
 * Maps the 11 real content_items.type values (see CONTENT_TYPES in
 * src/lib/content/types.ts — the single source of truth) onto the 6
 * library buckets requested for this page. Every type appears in exactly
 * one bucket.
 */
const BUCKETS = [
  {
    id: "posts",
    label: "Posts",
    types: ["linkedin_post", "instagram_post", "facebook_post", "twitter_post", "pinterest"],
  },
  { id: "reels", label: "Reels", types: ["instagram_reel", "tiktok_video"] },
  { id: "carousel", label: "Carousel", types: ["carousel"] },
  { id: "youtube_shorts", label: "YouTube Shorts", types: ["youtube_short"] },
  { id: "video", label: "Video", types: ["product_service_video"] },
  { id: "blog", label: "Blog", types: ["blog"] },
] as const;

type BucketId = (typeof BUCKETS)[number]["id"] | "all";

function thumbnailFor(item: ContentItem): string | null {
  const raw = item.image_url ?? item.carousel_image_urls?.[0] ?? null;
  return cachedMediaUrl(raw) ?? raw;
}

function statusStyles(status: string): string {
  if (status === "posted") return "bg-success text-success-foreground";
  if (status === "draft") return "bg-muted text-muted-foreground";
  return "bg-primary/10 text-primary";
}

/* ------------------------------ "Post now" helpers ----------------------------- */

/**
 * Where each content type may be published. Client-safe duplicate of
 * CHANNELS_BY_TYPE in content.server.ts (same split the detail dialog uses,
 * because that file is server-only). Keep all three lists in sync by hand.
 */
const CHANNELS_BY_TYPE: Record<string, string[]> = {
  blog: ["Website", "LinkedIn", "Medium", "Quora"],
  linkedin_post: ["LinkedIn"],
  instagram_post: ["Instagram"],
  instagram_reel: ["Instagram"],
  facebook_post: ["Facebook"],
  twitter_post: ["X"],
  pinterest: ["Pinterest"],
  youtube_short: ["YouTube"],
  tiktok_video: ["TikTok"],
  product_service_video: ["YouTube", "Website"],
  carousel: ["LinkedIn", "Instagram"],
};

const VIDEO_TYPES = ["instagram_reel", "youtube_short", "tiktok_video", "product_service_video"];
const IMAGE_TYPES = [
  "linkedin_post",
  "instagram_post",
  "facebook_post",
  "twitter_post",
  "pinterest",
];

interface BrandHandles {
  id: string;
  social_handles: Record<string, string> | null;
  website: string | null;
}

/**
 * Same rule the publish queue uses: never post something whose media isn't
 * ready yet (otherwise e.g. an Instagram reel with no video would go out as a
 * plain image).
 */
function mediaReady(item: ContentItem): boolean {
  if (VIDEO_TYPES.includes(item.type)) return Boolean(item.video_url);
  if (IMAGE_TYPES.includes(item.type)) return Boolean(item.image_url);
  if (item.type === "carousel") {
    const slides = item.carousel_slides?.length ?? 0;
    const images = (item.carousel_image_urls ?? []).filter(Boolean).length;
    return slides > 0 && images >= slides;
  }
  return true; // blog: no media needed
}

function isConfigured(channel: string, brand: BrandHandles | undefined): boolean {
  if (channel === "Website") return Boolean((brand?.website ?? "").trim());
  return Boolean(((brand?.social_handles ?? {})[channel] ?? "").trim());
}

/**
 * The channels this item will be posted to: the ones chosen on the item
 * (falling back to every channel valid for its format when none were chosen),
 * limited to handles that are actually configured in the Brand Profile.
 */
function targetsFor(item: ContentItem, brands: BrandHandles[]): string[] {
  const brand = brands.find((b) => b.id === item.brand_id) ?? brands[0];
  const allowed = CHANNELS_BY_TYPE[item.type] ?? [];
  const chosen = (item.platforms ?? []).filter((c) => allowed.includes(c));
  return (chosen.length > 0 ? chosen : allowed).filter((c) => isConfigured(c, brand));
}

function ContentLibraryPage() {
  const queryClient = useQueryClient();
  const [active, setActive] = useState<BucketId>("all");
  const [detail, setDetail] = useState<ContentItem | null>(null);

  /*
   * Unlike the Calendar (scoped to one month), the Library shows
   * everything ever generated for this account. Capped at 500 — plenty
   * for the current generation volume (44 pieces/month in production
   * cadence), revisit with real pagination if that stops being enough.
   */
  const scope = useBrandScope();
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["content-library", scope.brandId],
    enabled: !scope.loading,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("content_items")
        .select("*")
        // One brand at a time on the agency plan; no filter for single-brand accounts.
        .match(scope.brandId ? { brand_id: scope.brandId } : {})
        .order("scheduled_date", { ascending: false })
        .order("scheduled_time", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data as unknown as ContentItem[];
    },
    // Keep checking while any video is still rendering so it appears
    // (and becomes playable) without a manual reload.
    refetchInterval: (query) => {
      const current = (query.state.data ?? []) as ContentItem[];
      return current.some((i) => i.video_status === "generating") ? 8000 : false;
    },
  });

  // Keep an opened item in sync with the latest data (e.g. video finished).
  useEffect(() => {
    if (!detail) return;
    const fresh = items.find((i) => i.id === detail.id);
    if (fresh && fresh !== detail) setDetail(fresh);
  }, [items, detail]);

  const byBucket = useMemo(() => {
    const map = new Map<string, ContentItem[]>();
    for (const bucket of BUCKETS) map.set(bucket.id, []);
    for (const item of items) {
      const bucket = BUCKETS.find((b) => (b.types as readonly string[]).includes(item.type));
      if (bucket) map.get(bucket.id)!.push(item);
    }
    return map;
  }, [items]);

  const visibleItems = active === "all" ? items : (byBucket.get(active) ?? []);

  /* ------------------------------- "Post now" ------------------------------- */

  // Handles are configured per brand in the Brand Profile; load them once.
  const { data: brands = [] } = useQuery({
    queryKey: ["library-brand-handles"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return [] as BrandHandles[];
      const { data, error } = await supabase
        .from("brand_profiles")
        .select("id, social_handles, website")
        .eq("user_id", userData.user.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as BrandHandles[];
    },
  });

  const publish = useServerFn(publishContentItem);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const posting = progress !== null;

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Selected items that still exist (deleted ones drop out on their own).
  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.has(item.id)),
    [items, selectedIds],
  );

  // Split the selection into what can go out now and what must be skipped (and why).
  const plan = useMemo(() => {
    const ready: Array<{ item: ContentItem; targets: string[] }> = [];
    const skipped: Array<{ item: ContentItem; reason: string }> = [];
    for (const item of selectedItems) {
      if (!mediaReady(item)) {
        skipped.push({ item, reason: "its image/video is still being generated" });
        continue;
      }
      const targets = targetsFor(item, brands);
      if (targets.length === 0) {
        skipped.push({ item, reason: "no configured handle for this format (Brand Profile)" });
        continue;
      }
      ready.push({ item, targets });
    }
    return { ready, skipped };
  }, [selectedItems, brands]);

  const channelSummary = useMemo(() => {
    const counts = new Map<string, number>();
    for (const { targets } of plan.ready) {
      for (const channel of targets) counts.set(channel, (counts.get(channel) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([channel, n]) => `${channel} ×${n}`)
      .join(", ");
  }, [plan.ready]);

  const onPostNowClick = () => {
    if (!scope.isPrimary) {
      // Same rule the server applies to "publish all": channel connections belong to the
      // account, so only the first brand may publish to them.
      toast.error(
        "Publishing for additional brands needs their own connected channels, which is coming next. Nothing was posted.",
      );
      return;
    }
    if (plan.ready.length === 0) {
      toast.error(
        plan.skipped[0]
          ? `Nothing to post — ${plan.skipped[0].reason}.`
          : "Select at least one piece of content first.",
      );
      return;
    }
    setConfirmOpen(true);
  };

  const runPost = async () => {
    const queue = plan.ready;
    if (queue.length === 0) return;
    setProgress({ done: 0, total: queue.length });

    const finishedIds: string[] = []; // fully handled -> safe to deselect
    const manual: string[] = [];
    const failures: string[] = [];
    let postedItems = 0;
    let alreadyPosted = 0;

    // One request per item, in order: keeps each server call short (no single
    // long-running request) and lets a failure on one item not block the rest.
    for (let i = 0; i < queue.length; i += 1) {
      const { item, targets } = queue[i]!;
      try {
        const { results } = await publish({ data: { itemId: item.id, channels: targets } });
        if (results.length === 0) alreadyPosted += 1;
        const failed = results.filter((r) => !r.ok);
        for (const r of results.filter((x) => x.manual)) manual.push(`${r.channel}`);
        for (const f of failed) failures.push(`“${item.title}” → ${f.channel}: ${f.error}`);
        if (results.some((r) => r.ok && !r.manual)) postedItems += 1;
        if (failed.length === 0) finishedIds.push(item.id);
      } catch (error) {
        failures.push(
          `“${item.title}”: ${error instanceof Error ? error.message : "Could not post"}`,
        );
      }
      setProgress({ done: i + 1, total: queue.length });
    }

    setProgress(null);
    if (postedItems > 0)
      toast.success(`Posted ${postedItems} piece${postedItems === 1 ? "" : "s"} of content.`);
    if (manual.length > 0) {
      toast.info(
        `${Array.from(new Set(manual)).join(", ")} has no posting API — marked for manual posting.`,
      );
    }
    if (alreadyPosted > 0) {
      toast.info(
        `${alreadyPosted} item${alreadyPosted === 1 ? " was" : "s were"} already posted to these channels.`,
      );
    }
    for (const message of failures.slice(0, 5)) toast.error(message);
    if (failures.length > 5) toast.error(`…and ${failures.length - 5} more failed.`);

    // Keep failed items selected so a retry is one click.
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of finishedIds) next.delete(id);
      return next;
    });
    queryClient.invalidateQueries({ queryKey: ["content-library"] });
    queryClient.invalidateQueries({ queryKey: ["content"] });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Content Library</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every piece LOVIZA has generated, in one place — browse by format.
          </p>
        </div>
        <Button onClick={onPostNowClick} disabled={selectedItems.length === 0 || posting}>
          {posting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Send className="mr-2 h-4 w-4" />
          )}
          {posting
            ? `Posting ${progress.done}/${progress.total}…`
            : selectedItems.length > 0
              ? `Post now (${selectedItems.length})`
              : "Post now"}
        </Button>
      </div>

      <Tabs value={active} onValueChange={(v) => setActive(v as BucketId)}>
        <TabsList className="flex h-auto flex-wrap justify-start gap-1 bg-transparent p-0">
          <TabsTrigger value="all" className="rounded-full border border-border">
            All ({items.length})
          </TabsTrigger>
          {BUCKETS.map((bucket) => (
            <TabsTrigger
              key={bucket.id}
              value={bucket.id}
              className="rounded-full border border-border"
            >
              {bucket.label} ({byBucket.get(bucket.id)?.length ?? 0})
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={active} className="mt-6">
          {isLoading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : visibleItems.length === 0 ? (
            <div className="surface p-10 text-center text-sm text-muted-foreground">
              Nothing here yet. Generate content from the Content Calendar to fill this bucket.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {visibleItems.map((item) => {
                const thumb = thumbnailFor(item);
                const isSelected = selectedIds.has(item.id);
                return (
                  // The checkbox is a sibling of the card button (not inside it): interactive
                  // elements can't be nested, and this keeps "open details" and "select" separate.
                  <div
                    key={item.id}
                    className={cn(
                      "group relative flex flex-col overflow-hidden rounded-xl border text-left transition-colors hover:border-primary/50",
                      isSelected ? "border-primary ring-1 ring-primary" : "border-border",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setDetail(item)}
                      className="flex w-full flex-col text-left"
                    >
                      <div className="relative aspect-square w-full overflow-hidden bg-muted/20">
                        {thumb ? (
                          <img
                            src={thumb}
                            alt={item.title}
                            className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
                            <ImageOff className="h-6 w-6" />
                          </div>
                        )}
                        <Badge
                          variant="outline"
                          className={`absolute left-2 top-2 ${typeStyles[item.type] ?? ""}`}
                        >
                          {item.type}
                        </Badge>
                      </div>
                      <div className="space-y-1.5 p-3">
                        <p className="line-clamp-2 text-sm font-medium leading-snug">
                          {item.title}
                        </p>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(item.scheduled_date), "d MMM yyyy")}
                          </span>
                          <Badge className={`text-[10px] capitalize ${statusStyles(item.status)}`}>
                            {item.status}
                          </Badge>
                        </div>
                      </div>
                    </button>

                    <div className="absolute right-2 top-2 z-10 rounded-md bg-background/80 p-1 shadow-sm backdrop-blur-sm">
                      <Checkbox
                        className="h-5 w-5"
                        checked={isSelected}
                        onCheckedChange={() => toggleSelected(item.id)}
                        aria-label={`Select “${item.title}” to post`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <ContentDetailDialog
        item={detail}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
          queryClient.invalidateQueries({ queryKey: ["content-library"] });
        }}
      />

      {/* Posting publishes to live accounts and can't be undone, so confirm first. */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Post {plan.ready.length} piece{plan.ready.length === 1 ? "" : "s"} now?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  This publishes immediately to your configured handles
                  {channelSummary ? ` (${channelSummary})` : ""}. It can&apos;t be undone from here.
                </p>
                {plan.skipped.length > 0 && (
                  <p>
                    {plan.skipped.length} selected item{plan.skipped.length === 1 ? "" : "s"} will
                    be skipped: {plan.skipped[0]!.reason}
                    {plan.skipped.length > 1 ? " (and similar)" : ""}.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void runPost()}>Post now</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
