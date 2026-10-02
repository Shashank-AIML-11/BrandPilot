import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2, ImageOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cachedMediaUrl } from "@/lib/media";
import { Badge } from "@/components/ui/badge";
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
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["content-library"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("content_items")
        .select("*")
        .order("scheduled_date", { ascending: false })
        .order("scheduled_time", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data as unknown as ContentItem[];
    },
  });

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Content Library</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every piece LOVIZA has generated, in one place — browse by format.
        </p>
      </div>

      <Tabs value={active} onValueChange={(v) => setActive(v as BucketId)}>
        <TabsList className="flex h-auto flex-wrap justify-start gap-1 bg-transparent p-0">
          <TabsTrigger value="all" className="rounded-full border border-border">
            All ({items.length})
          </TabsTrigger>
          {BUCKETS.map((bucket) => (
            <TabsTrigger key={bucket.id} value={bucket.id} className="rounded-full border border-border">
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
                return (
                  <button
                    key={item.id}
                    onClick={() => setDetail(item)}
                    className="group flex flex-col overflow-hidden rounded-xl border border-border text-left transition-colors hover:border-primary/50"
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
                      <p className="line-clamp-2 text-sm font-medium leading-snug">{item.title}</p>
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
    </div>
  );
}
