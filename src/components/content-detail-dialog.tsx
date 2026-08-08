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

/** Where each content type is allowed to be published. */
const CHANNELS_BY_TYPE: Record<string, string[]> = {
  blog: ["LinkedIn", "Website", "Quora", "Medium"],
  infographic: ["LinkedIn", "X", "Instagram", "Facebook", "Pinterest"],
  video: ["YouTube", "TikTok"],
};

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
  platforms: string[] | null;
  status: string;
  enabled: boolean;
}

export const typeStyles: Record<string, string> = {
  blog: "bg-blog/15 text-blog border-blog/30",
  infographic: "bg-infographic/15 text-infographic border-infographic/30",
  video: "bg-video/15 text-video border-video/30",
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

        {item.type === "video" && (
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
                      : "Rendering in the background. It will be ready here automatically."}
                  </p>
                  {item.video_status !== "failed" && <Progress className="w-2/3" />}
                </div>
              </div>
            )}
          </div>
        )}

        {item.type === "infographic" && (
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
