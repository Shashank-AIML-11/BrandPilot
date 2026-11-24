import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { publishContentItem } from "@/lib/channels.functions";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Send, Trash2, TriangleAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cachedMediaUrl, signedMediaUrl } from "@/lib/media";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Where each content type is allowed to be published. Client-safe
 * duplicate of CHANNELS_BY_TYPE in content.server.ts — kept separate
 * because that file is server-only and this component is client-side.
 * Keep both lists in sync by hand.
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

/** Same client/server split as CHANNELS_BY_TYPE above. */
const VIDEO_TYPES = ["instagram_reel", "youtube_short", "tiktok_video", "product_service_video"];
const IMAGE_TYPES = ["linkedin_post", "instagram_post", "facebook_post", "twitter_post", "pinterest"];

export interface ContentItem {
  brand_id?: string | null;
  id: string;
  scheduled_date: string;
  scheduled_time: string | null;
  type: string;
  title: string;
  summary: string | null;
  body: string | null;
  caption: string | null;
  hashtags: string | null;
  image_prompt: string | null;
  image_url: string | null;
  video_script: string | null;
  video_url: string | null;
  video_status?: string | null;
  video_error?: string | null;
  carousel_slides?: Array<{ headline?: string; subtext?: string; image_prompt?: string }> | null;
  carousel_image_urls?: string[] | null;
  platforms: string[] | null;
  status: string;
  enabled: boolean;
  reviewed_at?: string | null;
}

/** Title the queue writes on a slot the AI failed to fill. Such a card has nothing to post. */
export const FAILED_PLACEHOLDER_TITLE = "Content generation failed";
export const isFailedItem = (item: Pick<ContentItem, "status" | "title">) =>
  item.status === "failed" || item.title === FAILED_PLACEHOLDER_TITLE;

export const typeStyles: Record<string, string> = {
  blog: "bg-blog/15 text-blog border-blog/30",
  linkedin_post: "bg-linkedin_post/15 text-linkedin_post border-linkedin_post/30",
  instagram_post: "bg-instagram_post/15 text-instagram_post border-instagram_post/30",
  instagram_reel: "bg-instagram_reel/15 text-instagram_reel border-instagram_reel/30",
  facebook_post: "bg-facebook_post/15 text-facebook_post border-facebook_post/30",
  twitter_post: "bg-twitter_post/15 text-twitter_post border-twitter_post/30",
  pinterest: "bg-pinterest/15 text-pinterest border-pinterest/30",
  youtube_short: "bg-youtube_short/15 text-youtube_short border-youtube_short/30",
  tiktok_video: "bg-tiktok_video/15 text-tiktok_video border-tiktok_video/30",
  product_service_video:
    "bg-product_service_video/15 text-product_service_video border-product_service_video/30",
  carousel: "bg-carousel/15 text-carousel border-carousel/30",
};

export function ContentDetailDialog({
  item,
  onOpenChange,
  onFinishReview,
  finishing,
}: {
  item: ContentItem | null;
  onOpenChange: (open: boolean) => void;
  /** When given (Content Library), the footer shows "Finish Review" for unreviewed items. */
  onFinishReview?: (item: ContentItem) => void;
  finishing?: boolean;
}) {
  const queryClient = useQueryClient();
  const [imageUrl, setImageUrl] = useState<string | null>(() => cachedMediaUrl(item?.image_url));
  const [videoUrl, setVideoUrl] = useState<string | null>(() => cachedMediaUrl(item?.video_url));

  // Prefetched during the month load, so this paints synchronously from cache.
  useEffect(() => {
    setImageUrl(cachedMediaUrl(item?.image_url));
    if (item?.image_url && !cachedMediaUrl(item.image_url)) {
      void signedMediaUrl(item.image_url).then(setImageUrl);
    }
  }, [item?.id, item?.image_url]);

  useEffect(() => {
    setVideoUrl(cachedMediaUrl(item?.video_url));
    if (item?.video_url && !cachedMediaUrl(item.video_url)) {
      void signedMediaUrl(item.video_url).then(setVideoUrl);
    }
  }, [item?.id, item?.video_url]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["content"] });

  const { data: brand } = useQuery({
    queryKey: ["brand-profile-handles", item?.brand_id ?? null],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return null;
      let query = supabase
        .from("brand_profiles")
        .select("social_handles, website")
        .eq("user_id", userData.user.id);
      // The brand this piece belongs to (an account can own several).
      if (item?.brand_id) query = query.eq("id", item.brand_id);
      const { data: row } = await query
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      return row;
    },
  });

  const handles = (brand?.social_handles as Record<string, string> | null) ?? {};
  const configured = (channel: string) =>
    channel === "Website"
      ? Boolean((brand?.website ?? "").trim())
      : Boolean((handles[channel] ?? "").trim());

  const selected = item?.platforms ?? [];

  const publish = useServerFn(publishContentItem);

  const post = useMutation({
    mutationFn: async () => {
      const allowed = CHANNELS_BY_TYPE[item!.type] ?? [];
      // Channels picked for this card, else every channel the brand has set up for its format.
      let targets = selected.filter((c) => allowed.includes(c) && configured(c));
      if (targets.length === 0) targets = allowed.filter(configured);
      if (targets.length === 0) {
        throw new Error("No channel is set up for this content. Add your handles on the Brand Profile page first.");
      }
      return publish({ data: { itemId: item!.id, channels: targets, repost: item!.status === "posted" } });
    },
    onSuccess: ({ results }) => {
      const posted = results.filter((r) => r.ok && !r.manual).map((r) => r.channel);
      const manual = results.filter((r) => r.manual).map((r) => r.channel);
      const failed = results.filter((r) => !r.ok);
      if (posted.length) toast.success(`Published to ${posted.join(", ")}`);
      if (manual.length)
        toast.info(`${manual.join(", ")} has no posting API — marked for manual posting`);
      for (const f of failed) toast.error(`${f.channel}: ${f.error}`);
      invalidate();
      if (failed.length === 0) onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not post"),
  });

  const postNow = () => {
    if (!item) return;
    const again = item.status === "posted";
    const ok = window.confirm(
      again
        ? `Post “${item.title}” again? It will be published again right now.`
        : `Post “${item.title}” now? It will be published right now.`,
    );
    if (ok) post.mutate();
  };

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("content_items").delete().eq("id", item!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Deleted");
      invalidate();
      onOpenChange(false);
    },
  });

  if (!item) return null;

  return (
    <Dialog open={Boolean(item)} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] max-w-3xl flex-col gap-0 overflow-hidden p-0">
        {/* Frozen header: stays in place while the content below scrolls. */}
        <DialogHeader className="shrink-0 space-y-0 border-b border-border bg-background p-6 pr-12">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={typeStyles[item.type]}>
                {item.type}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {item.scheduled_date} · {item.scheduled_time?.slice(0, 5) ?? "—"}
              </span>
              <Badge variant="secondary" className="capitalize">
                {item.status}
              </Badge>
            </div>
            <Button
              size="sm"
              className="shrink-0"
              onClick={postNow}
              disabled={post.isPending || isFailedItem(item)}
              title={isFailedItem(item) ? "This card failed to generate" : item.status === "posted" ? "Post this card again" : "Post this card now"}
            >
              {post.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Post Now
            </Button>
          </div>
          <DialogTitle className="pt-2 text-xl">{item.title}</DialogTitle>
          {item.summary && <DialogDescription className="pt-1.5">{item.summary}</DialogDescription>}
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
        {isFailedItem(item) && (
          <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div className="flex-1">
              <p className="font-medium text-destructive">This card failed to generate</p>
              <p className="text-muted-foreground">
                The AI did not return content for this slot, so there is nothing to post. Delete it, then generate again.
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => remove.mutate()} disabled={remove.isPending}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
            </Button>
          </div>
        )}

        {VIDEO_TYPES.includes(item.type) && (
          <div className="space-y-3">
            {videoUrl ? (
              <video
                src={videoUrl}
                poster={imageUrl ?? undefined}
                controls
                playsInline
                className="mx-auto max-h-[70vh] w-auto max-w-full rounded-xl border border-border bg-black"
              />
            ) : (
              <div className="relative overflow-hidden rounded-xl border border-border bg-black">
                {imageUrl ? (
                  <img src={imageUrl} alt={item.title} className="w-full opacity-60" />
                ) : (
                  <div className="aspect-video w-full bg-muted/20" />
                )}
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/45 p-6 text-center">
                  <Loader2 className="h-7 w-7 animate-spin text-primary" />
                  <p className="text-sm text-foreground">
                    {item.video_status === "failed"
                      ? "This video could not be rendered."
                      : item.video_status === "generating"
                        ? "Rendering in the background. It will be ready here automatically."
                        : item.video_error
                          ? `Video request was rejected: ${item.video_error}`
                          : "Video is queued. It starts on the next background run."}
                  </p>
                  {item.video_status === "generating" && <Progress className="w-2/3" />}
                </div>
              </div>
            )}
          </div>
        )}

        {IMAGE_TYPES.includes(item.type) && (
          <div className="space-y-3">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={item.title}
                className="w-full rounded-xl border border-border"
              />
            ) : (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-8 text-center">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Preparing the visual…</p>
              </div>
            )}

            {item.image_prompt && (
              <p className="text-xs text-muted-foreground">Art direction: {item.image_prompt}</p>
            )}
          </div>
        )}

        {item.type === "carousel" && (
          <CarouselSlides
            slides={item.carousel_slides ?? []}
            imagePaths={item.carousel_image_urls ?? []}
          />
        )}

        {item.body && (
          <article className="whitespace-pre-wrap rounded-xl border border-border bg-card p-5 text-sm leading-relaxed">
            {item.body}
          </article>
        )}

        {item.video_script && (
          <article className="whitespace-pre-wrap rounded-xl border border-border bg-card p-5 font-mono text-xs leading-relaxed">
            {item.video_script}
          </article>
        )}

        {item.caption && (
          <div className="rounded-xl border border-border p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Caption</p>
            <p className="mt-1 text-sm">{item.caption}</p>
            {item.hashtags && <p className="mt-2 text-sm text-primary">{item.hashtags}</p>}
          </div>
        )}

        {onFinishReview && item.status !== "posted" && !item.reviewed_at && !isFailedItem(item) ? (
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button onClick={() => onFinishReview(item)} disabled={finishing}>
              {finishing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              Finish Review
            </Button>
          </div>
        ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CarouselSlides({
  slides,
  imagePaths,
}: {
  slides: Array<{ headline?: string; subtext?: string }>;
  imagePaths: string[];
}) {
  const [urls, setUrls] = useState<Record<number, string | null>>({});

  useEffect(() => {
    imagePaths.forEach((path, i) => {
      const cached = cachedMediaUrl(path);
      if (cached) {
        setUrls((prev) => (prev[i] === cached ? prev : { ...prev, [i]: cached }));
        return;
      }
      void signedMediaUrl(path).then((url) =>
        setUrls((prev) => ({ ...prev, [i]: url })),
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imagePaths.join("|")]);

  if (!slides.length) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-8 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Preparing carousel slides…</p>
      </div>
    );
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {slides.map((slide, i) => {
        const url = urls[i];
        return (
          <div
            key={i}
            className="w-56 shrink-0 space-y-2 rounded-xl border border-border p-2"
          >
            {url ? (
              <img
                src={url}
                alt={slide.headline ?? `Slide ${i + 1}`}
                className="aspect-square w-full rounded-lg object-cover"
              />
            ) : (
              <div className="flex aspect-square w-full items-center justify-center rounded-lg bg-muted/20">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            )}
            <p className="text-xs font-medium">{slide.headline}</p>
            {slide.subtext && (
              <p className="text-xs text-muted-foreground">{slide.subtext}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
