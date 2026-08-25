import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { publishContentItem } from "@/lib/channels.functions";
import { toast } from "sonner";
import { Loader2, Send, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cachedMediaUrl, signedMediaUrl } from "@/lib/media";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
  carousel_slides?: Array<{ headline?: string; subtext?: string; image_prompt?: string }> | null;
  carousel_image_urls?: string[] | null;
  platforms: string[] | null;
  status: string;
  enabled: boolean;
}

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
}: {
  item: ContentItem | null;
  onOpenChange: (open: boolean) => void;
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
    queryKey: ["brand-profile-handles"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return null;
      const { data: row } = await supabase
        .from("brand_profiles")
        .select("social_handles, website")
        .eq("user_id", userData.user.id)
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

  const setPlatforms = useMutation({
    mutationFn: async (platforms: string[]) => {
      const { error } = await supabase
        .from("content_items")
        .update({ platforms })
        .eq("id", item!.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: () => toast.error("Could not update channels"),
  });

  const toggleChannel = (channel: string) => {
    if (!configured(channel)) {
      toast.error(
        `${channel} is not configured — add your ${channel} handle/ID on the Brand Profile page first.`,
      );
      return;
    }
    const next = selected.includes(channel)
      ? selected.filter((p) => p !== channel)
      : [...selected, channel];
    setPlatforms.mutate(next);
  };

  const publish = useServerFn(publishContentItem);

  const post = useMutation({
    mutationFn: async () => {
      const targets = selected.filter(configured);
      if (targets.length === 0) throw new Error("No configured channel selected for this content");
      return publish({ data: { itemId: item!.id, channels: targets } });
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

  const toggle = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await supabase
        .from("content_items")
        .update({ enabled })
        .eq("id", item!.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  if (!item) return null;

  return (
    <Dialog open={Boolean(item)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
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
          <DialogTitle className="pt-2 text-xl">{item.title}</DialogTitle>
          {item.summary && <DialogDescription>{item.summary}</DialogDescription>}
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
          <div className="flex flex-wrap gap-1.5">
            {(CHANNELS_BY_TYPE[item.type] ?? []).map((p) => {
              const ready = configured(p);
              const on = ready && selected.includes(p);
              return (
                <button
                  key={p}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleChannel(p)}
                  disabled={setPlatforms.isPending}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    on
                      ? "border-primary bg-primary text-primary-foreground"
                      : ready
                        ? "border-border bg-muted/40 text-muted-foreground hover:bg-muted"
                        : "cursor-not-allowed border-dashed border-border bg-transparent text-muted-foreground/50",
                  )}
                  title={ready ? p : `${p} handle not configured in Brand Profile`}
                >
                  {p}
                </button>
              );
            })}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={item.enabled}
              onCheckedChange={(v) => toggle.mutate(v)}
              aria-label="Enable content"
            />
            {item.enabled ? "Scheduled" : "Disabled"}
          </label>
        </div>

        {VIDEO_TYPES.includes(item.type) && (
          <div className="space-y-3">
            {videoUrl ? (
              <video
                src={videoUrl}
                poster={imageUrl ?? undefined}
                controls
                playsInline
                className="w-full rounded-xl border border-border bg-black"
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
                        : "Video generation is currently paused."}
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

        <div className="flex flex-wrap justify-between gap-2 pt-2">
          <Button variant="ghost" onClick={() => remove.mutate()} disabled={remove.isPending}>
            <Trash2 className="mr-2 h-4 w-4" /> Delete
          </Button>
          <Button
            onClick={() => post.mutate()}
            disabled={post.isPending || !item.enabled || item.status === "posted"}
          >
            <Send className="mr-2 h-4 w-4" />
            {item.status === "posted" ? "Already posted" : "Post now"}
          </Button>
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
