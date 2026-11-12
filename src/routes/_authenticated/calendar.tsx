import { useBrandScope } from "@/lib/brand-scope";
import { useEffect, useMemo, useState, useRef, } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
  endOfWeek,
} from "date-fns";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
  Send,
  Sparkles,
  ImageOff,
  CheckCircle2,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { cachedMediaUrl, prefetchMediaUrls } from "@/lib/media";
import { queueMonthGeneration, processGenerationQueueNow, processVideoQueueNow } from "@/lib/content.functions";
import { publishAllContent, publishContentItem } from "@/lib/channels.functions";
import { useServerFn } from "@tanstack/react-start";
import { Checkbox } from "@/components/ui/checkbox";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

import {
  ContentDetailDialog,
  typeStyles,
  type ContentItem,
} from "@/components/content-detail-dialog";

export const Route = createFileRoute("/_authenticated/calendar")({
  head: () => ({
    meta: [
      { title: "Content Calendar — LOVIZA" },
      {
        name: "description",
        content:
          "A month of platform-native posts, carousels and videos scheduled day by day across channels.",
      },
      {
        property: "og:title",
        content: "Content Calendar — LOVIZA",
      },
      {
        property: "og:description",
        content:
          "Open any day to review, enable or disable scheduled content.",
      },
    ],
  }),
  component: CalendarPage,
});

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type ReviewTab = "generated" | "reviewed" | "posted";
const REVIEW_TABS: Array<{ id: ReviewTab; label: string }> = [
  { id: "generated", label: "Generated" },
  { id: "reviewed", label: "Reviewed - Ready to Post" },
  { id: "posted", label: "Posted" },
];
const reviewTabOf = (item: ContentItem): ReviewTab =>
  item.status === "posted" ? "posted" : item.reviewed_at ? "reviewed" : "generated";

/** Channels each format may be posted to (same split the detail dialog uses). */
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

function CalendarPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  // Month grid (default) or a single week with the full cards listed under each day.
  const [view, setView] = useState<"month" | "week">("month");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [reviewTab, setReviewTab] = useState<ReviewTab>("generated");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [finishing, setFinishing] = useState(false);
  const [postProgress, setPostProgress] = useState<{ done: number; total: number } | null>(null);
  const publishItem = useServerFn(publishContentItem);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [detail, setDetail] = useState<ContentItem | null>(null);

  const [queueing, setQueueing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [posting, setPosting] = useState(false);

  const processingGeneration = useRef(false);
  const processingMedia = useRef(false);

  const monthKey = format(cursor, "yyyy-MM");
  // Agency (Scale) accounts work on one brand at a time; single-brand accounts have no filter.
  const scope = useBrandScope();
  const brandFilter = scope.brandId ? { brand_id: scope.brandId } : {};
  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);

  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const weekLabel = `${format(weekStart, "d MMM")} – ${format(weekEnd, "d MMM yyyy")}`;

  const days = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(monthStart, { weekStartsOn: 1 }),
        end: endOfWeek(monthEnd, { weekStartsOn: 1 }),
      }),
    [monthStart, monthEnd],
  );

  /*
   * LOAD CURRENT MONTH CONTENT
   */
  const { data: items = [], isLoading } = useQuery({
    // In week view the range also covers the selected week (it can span two months).
    queryKey: ["content", monthKey, scope.brandId, view === "week" ? format(weekStart, "yyyy-MM-dd") : "month"],
    enabled: !scope.loading,

    queryFn: async () => {
      const { data, error } = await supabase
        .from("content_items")
        .select("*")
        .match(brandFilter)
        .gte(
          "scheduled_date",
          format(view === "week" && weekStart < monthStart ? weekStart : monthStart, "yyyy-MM-dd"),
        )
        .lte(
          "scheduled_date",
          format(view === "week" && weekEnd > monthEnd ? weekEnd : monthEnd, "yyyy-MM-dd"),
        )
        .order("scheduled_time", {
          ascending: true,
        });

      if (error) throw error;

      return data as unknown as ContentItem[];
    },

    refetchInterval: (query) => {
      const current = (query.state.data ?? []) as ContentItem[];

      const VIDEO_TYPES = ["instagram_reel", "youtube_short", "tiktok_video", "product_service_video"];

      const hasRenderingAssets = current.some((item) => {
        if (item.type === "blog") return false;
        if (item.type === "carousel") {
          const slideCount = item.carousel_slides?.length ?? 0;
          const imageCount = (item.carousel_image_urls ?? []).filter(Boolean).length;
          return imageCount < slideCount;
        }
        if (VIDEO_TYPES.includes(item.type)) {
          // Thumbnail still needs to render, or the video itself is
          // actively generating. Don't poll forever just because video
          // generation is paused (video_status stays "none" indefinitely
          // in that case) — "Ready · video paused" is the resting state.
          return !item.image_url || item.video_status === "generating";
        }
        return !item.image_url;
      });

      return hasRenderingAssets ? 15000 : false;
    },
  });

  /*
   * CURRENT GENERATION JOB
   */
  const { data: activeJob } = useQuery({
    queryKey: ["generation-job", monthKey, scope.brandId],
    enabled: !scope.loading,

    queryFn: async () => {
      const { data, error } = await supabase
        .from("content_generation_jobs")
        .select(
          "id, status, days_done, days_total, error",
        )
        .match(brandFilter)
        .eq("month", monthKey)
        .in("status", ["pending", "running"])
        .maybeSingle();

      if (error) throw error;

      return data;
    },

    refetchInterval: (query) =>
      query.state.data ? 10000 : 30000,
  });

  /*
   * Refresh calendar while generation is running.
   */
  /*
  * ============================================================
  * BACKGROUND GENERATION PUMP
  * ============================================================
  *
  * queueMonthGeneration() creates the job and immediately
  * returns.
  *
  * This effect actually processes the queued generation.
  *
  * It runs one server-side generation batch at a time.
  *
  * The browser does NOT wait for the entire month.
  */
  useEffect(() => {
    if (!activeJob) {
      return;
    }

    let cancelled = false;

    let timer:
      ReturnType<typeof setTimeout> |
      undefined;

    const processNextBatch =
      async () => {
        if (
          cancelled ||
          processingGeneration.current
        ) {
          return;
        }

        processingGeneration.current =
          true;

        try {
          const result =
            await processGenerationQueueNow();

          /*
          * Immediately refresh the calendar.
          *
          * Rendering → Ready happens here because
          * the worker updates the existing DB rows.
          */
          await queryClient.invalidateQueries({
            queryKey: [
              "content",
              monthKey,
            ],
          });

          /*
          * Refresh generation progress.
          */
          await queryClient.invalidateQueries({
            queryKey: [
              "generation-job",
              monthKey,
            ],
          });

          /*
          * Stop if generation was cancelled
          * by Refresh Calendar.
          */
          if (
            result?.cancelled
          ) {
            return;
          }

          /*
          * Stop on generation error.
          *
          * The server job will be marked failed.
          */
          if (
            result?.error
          ) {
            toast.error(
              result.error,
            );

            return;
          }

          /*
          * If another batch is still pending,
          * process it shortly.
          */
          if (
            result?.generated &&
            !cancelled
          ) {
            timer =
              setTimeout(
                processNextBatch,
                500,
              );
          }
        } catch (error) {
          if (
            !cancelled
          ) {
            toast.error(
              error instanceof Error
                ? error.message
                : "Background generation failed.",
            );
          }
        } finally {
          processingGeneration.current =
            false;
        }
      };

    void processNextBatch();

    return () => {
      cancelled = true;

      if (timer) {
        clearTimeout(timer);
      }

      processingGeneration.current =
        false;
    };
  }, [
    activeJob?.id,
    monthKey,
    queryClient,
  ]);

  /*
   * ============================================================
   * BACKGROUND MEDIA PUMP
   * ============================================================
   *
   * processGenerationQueueNow() (above) only writes text fields
   * (title/caption/body/image_prompt/etc) — it never renders the actual
   * image or video. That's processVideoQueueNow()'s job (it also
   * handles single-image types and carousel slides despite the name),
   * and until now nothing on the client ever called it. Text-only
   * generation would finish, the generation job would go from
   * "running" to "completed", the effect above would stop firing
   * (it's gated on activeJob existing) — and any item still missing
   * its image/video would just sit at "Preparing the visual..."
   * forever, since nothing was left polling to render it.
   *
   * This effect is independent of activeJob on purpose: media can
   * still be missing well after the text-generation job is long done,
   * and it needs to keep being picked up regardless.
   */
  useEffect(() => {
    const hasRenderingAssets = items.some((item) => {
      if (item.type === "blog") return false;
      if (item.type === "carousel") {
        const slideCount = item.carousel_slides?.length ?? 0;
        const imageCount = (item.carousel_image_urls ?? []).filter(Boolean).length;
        return imageCount < slideCount;
      }
      const VIDEO_TYPES = ["instagram_reel", "youtube_short", "tiktok_video", "product_service_video"];
      if (VIDEO_TYPES.includes(item.type)) {
        return !item.image_url || item.video_status === "generating";
      }
      return !item.image_url;
    });

    if (!hasRenderingAssets) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const processNextMediaBatch = async () => {
      if (cancelled || processingMedia.current) return;
      processingMedia.current = true;

      try {
        await processVideoQueueNow();
        await queryClient.invalidateQueries({ queryKey: ["content", monthKey] });
      } catch (error) {
        if (!cancelled) {
          console.error("Media generation failed:", error);
        }
      } finally {
        processingMedia.current = false;
        if (!cancelled) {
          // Keep polling — there may be more items still missing media,
          // or new ones queued after this batch started.
          timer = setTimeout(processNextMediaBatch, 2000);
        }
      }
    };

    void processNextMediaBatch();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      processingMedia.current = false;
    };
  }, [items, monthKey, queryClient]);

    /*
    * Prefetch media URLs.
    */
    useEffect(() => {
      if (!items.length) return;

      void prefetchMediaUrls(
        items.flatMap((item) => [
          item.image_url,
          item.video_url,
          ...(item.carousel_image_urls ?? []),
        ]),
      );
    }, [items]);

    /*
    * GROUP CONTENT BY DATE
    */
    const byDate = useMemo(() => {
      const map = new Map<string, ContentItem[]>();

      items.forEach((item) => {
        const list = map.get(item.scheduled_date) ?? [];

        list.push(item);

        map.set(item.scheduled_date, list);
      });

      return map;
    }, [items]);

    // Items of the selected week and how many sit in each review tab.
    const weekItems = useMemo(() => {
      const from = format(weekStart, "yyyy-MM-dd");
      const to = format(weekEnd, "yyyy-MM-dd");
      return items.filter((i) => i.scheduled_date >= from && i.scheduled_date <= to);
    }, [items, weekStart, weekEnd]);
    const reviewCounts = useMemo(() => {
      const c: Record<ReviewTab, number> = { generated: 0, reviewed: 0, posted: 0 };
      for (const i of weekItems) c[reviewTabOf(i)] += 1;
      return c;
    }, [weekItems]);
    const selectedItems = useMemo(
      () => items.filter((i) => selectedIds.has(i.id) && reviewTabOf(i) === "reviewed"),
      [items, selectedIds],
    );

    async function finishReview(item: ContentItem) {
      setFinishing(true);
      const { error } = await supabase
        .from("content_items")
        .update({ reviewed_at: new Date().toISOString() } as never)
        .eq("id", item.id);
      setFinishing(false);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Review finished — moved to “Reviewed - Ready to Post”.");
      setDetail(null);
      await queryClient.invalidateQueries({ queryKey: ["content"] });
    }

    async function postSelected() {
      const queue = selectedItems;
      if (queue.length === 0) return;
      if (!window.confirm(`Post ${queue.length} reviewed piece${queue.length === 1 ? "" : "s"} now? This publishes immediately to your connected handles.`)) return;
      setPostProgress({ done: 0, total: queue.length });
      const done: string[] = [];
      for (let i = 0; i < queue.length; i += 1) {
        const item = queue[i]!;
        const allowed = CHANNELS_BY_TYPE[item.type] ?? [];
        const chosen = (item.platforms ?? []).filter((c) => allowed.includes(c));
        try {
          const { results } = await publishItem({ data: { itemId: item.id, channels: chosen.length ? chosen : allowed } });
          const failed = results.filter((r) => !r.ok);
          for (const f of failed) toast.error(`“${item.title}” → ${f.channel}: ${f.error}`);
          if (results.some((r) => r.ok && !r.manual)) toast.success(`Posted “${item.title}”`);
          if (failed.length === 0) done.push(item.id);
        } catch (error) {
          toast.error(`“${item.title}”: ${error instanceof Error ? error.message : "Could not post"}`);
        }
        setPostProgress({ done: i + 1, total: queue.length });
      }
      setPostProgress(null);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of done) next.delete(id);
        return next;
      });
      await queryClient.invalidateQueries({ queryKey: ["content"] });
    }

    /*
    * GENERATE MONTH
    *
    * IMPORTANT:
    * The server now ONLY queues the job.
    * It does NOT wait for AI generation.
    */
    async function generateMonth() {
        if (
    queueing ||
    activeJob ||
    items.length > 0 ||
    refreshing
  ) {
    return;
  }

      const monthDays = eachDayOfInterval({
        start: monthStart,
        end: monthEnd,
      }).map((day) =>
        format(day, "yyyy-MM-dd"),
      );

      setQueueing(true);

      try {
        const result = await queueMonthGeneration({
          data: {
            month: monthKey,
            dates: monthDays,
            ...(scope.brandId ? { brandId: scope.brandId } : {}),
          },
        });

        await queryClient.invalidateQueries({
          queryKey: ["content", monthKey],
        });

        await queryClient.invalidateQueries({
          queryKey: ["generation-job", monthKey],
        });

        toast.success(
          result?.queued
            ? `${result.queued} days queued for ${format(
                cursor,
                "MMMM yyyy",
              )}. Generation will continue in the background.`
            : `${format(
                cursor,
                "MMMM yyyy",
              )} generation queued.`,
        );
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not start generation.",
        );
      } finally {
        setQueueing(false);
      }
    }

  /*
   * REFRESH CALENDAR
   *
   * Deletes:
   *  - current month's generated content
   *  - current month's generation job
   *
   * It does NOT delete:
   *  - Brand Profile
   *  - social connections
   *  - other months
   *  - account data
   */
  async function refreshCalendar() {
    if (refreshing) return;

    const confirmed = window.confirm(
      `Clear ALL generated content from ${format(
        cursor,
        "MMMM yyyy",
      )}?\n\nThis will remove the content from this month's calendar.`,
    );

    if (!confirmed) return;

    setRefreshing(true);

    try {
      const {
        data: userData,
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !userData.user) {
        throw new Error(
          "Your login session could not be verified.",
        );
      }

      /*
       * First remove/cancel the generation job.
       */
      const { error: jobError } = await supabase
        .from("content_generation_jobs")
        .delete()
        .eq("user_id", userData.user.id)
        .match(brandFilter)
        .eq("month", monthKey);

      if (jobError) {
        throw new Error(
          `Could not clear generation job: ${jobError.message}`,
        );
      }

      /*
       * Then delete this month's calendar content.
       */
      const { error: contentError } = await supabase
        .from("content_items")
        .delete()
        .eq("user_id", userData.user.id)
        .match(brandFilter)
        .gte(
          "scheduled_date",
          format(monthStart, "yyyy-MM-dd"),
        )
        .lte(
          "scheduled_date",
          format(monthEnd, "yyyy-MM-dd"),
        );

      if (contentError) {
        throw new Error(
          `Could not clear calendar content: ${contentError.message}`,
        );
      }

      /*
       * Close opened panels.
       */
      setOpenDay(null);
      setDetail(null);

      /*
       * Force fresh database reads.
       */
      await queryClient.invalidateQueries({
        queryKey: ["content", monthKey],
      });

      await queryClient.invalidateQueries({
        queryKey: ["generation-job", monthKey],
      });

      await queryClient.refetchQueries({
        queryKey: ["content", monthKey],
      });

      toast.success(
        `${format(
          cursor,
          "MMMM yyyy",
        )} calendar has been completely cleared.`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not refresh calendar.",
      );
    } finally {
      setRefreshing(false);
    }
  }

  /*
   * POST CONTENT
   */
  function postContent() {
    // Posting is a manual, per-card choice: open the Content Library, where cards can
    // be selected and published with the "Post now" button.
    void navigate({ to: "/content-library" });
  }

  /*
   * ENABLE / DISABLE DAY
   */
  async function toggleDay(
    date: string,
    enabled: boolean,
  ) {
    const { error } = await supabase
      .from("content_items")
      .update({ enabled })
      .eq("scheduled_date", date);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(
      enabled
        ? "Day enabled"
        : "Day disabled",
    );

    await queryClient.invalidateQueries({
      queryKey: ["content", monthKey],
    });
  }

  const dayItems = openDay
    ? byDate.get(openDay) ?? []
    : [];

  /*
   * Keep opened detail synchronized with database.
   */
  useEffect(() => {
    if (!detail) return;

    const refreshed = items.find(
      (item) => item.id === detail.id,
    );

    if (refreshed) {
      setDetail(refreshed);
    }
  }, [items, detail]);

  // Only this month's content counts (the week view can also load days of a neighbouring month).
  const hasCalendarContent = items.some(
    (i) =>
      i.scheduled_date >= format(monthStart, "yyyy-MM-dd") &&
      i.scheduled_date <= format(monthEnd, "yyyy-MM-dd"),
  );

  return (
    <div className="space-y-6">

      {/* ====================================================== */}
      {/* HEADER */}
      {/* ====================================================== */}

      <div className="flex flex-wrap items-end justify-between gap-4">

        <div>
          <h1 className="text-2xl font-bold">
            Content Calendar
          </h1>

          <p className="mt-1 text-sm text-muted-foreground">
            Plan-based posts, carousels and videos,
            generated from your brand profile.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">

          {/* Month / Week toggle */}
          <div className="inline-flex rounded-md border border-border p-0.5">
            {(["month", "week"] as const).map((v) => (
              <Button
                key={v}
                type="button"
                size="sm"
                variant={view === v ? "default" : "ghost"}
                className="h-8 px-3 capitalize"
                onClick={() => {
                  if (v === "week" && view !== "week") {
                    // Show the week containing today when it is in the visible month, else the month's first week.
                    const today = new Date();
                    setWeekStart(
                      isSameMonth(today, cursor)
                        ? startOfWeek(today, { weekStartsOn: 1 })
                        : startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 }),
                    );
                  }
                  setView(v);
                }}
              >
                {v === "month" ? "Monthly" : "Weekly"}
              </Button>
            ))}
          </div>

          {/* Previous */}
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              if (view === "week") {
                const next = addDays(weekStart, -7);
                setWeekStart(next);
                setCursor(startOfMonth(next));
              } else setCursor(addMonths(cursor, -1));
            }}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          {/* Current period */}
          <span className="w-44 text-center font-display text-lg font-semibold">
            {view === "week" ? weekLabel : format(cursor, "MMMM yyyy")}
          </span>

          {/* Next */}
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              if (view === "week") {
                const next = addDays(weekStart, 7);
                setWeekStart(next);
                setCursor(startOfMonth(next));
              } else setCursor(addMonths(cursor, 1));
            }}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>

          {/* Generate */}
          <Button
            onClick={generateMonth}
            disabled={
              queueing ||
              Boolean(activeJob) ||
              refreshing ||
              hasCalendarContent
            }
          >
            {queueing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}

            {queueing
              ? "Queueing…"
              : activeJob
                ? `Generating ${
                    activeJob.days_done
                  }/${activeJob.days_total}`
                : "Generate Content"}
          </Button>

          {/* POST CONTENT */}
          <Button
            variant="secondary"
            onClick={postContent}
            disabled={
              posting ||
              refreshing
            }
          >
            {posting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}

            {posting
              ? "Posting…"
              : "Post Content"}
          </Button>

          {/* REFRESH CALENDAR */}
          <Button
            variant="outline"
            onClick={refreshCalendar}
            disabled={
              refreshing ||
              queueing
            }
          >
            {refreshing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}

            {refreshing
              ? "Refreshing…"
              : "Refresh Calendar"}
          </Button>

        </div>
      </div>

      {/* ====================================================== */}
      {/* GENERATION STATUS */}
      {/* ====================================================== */}

      {activeJob && (
        <div className="rounded-lg border border-border bg-card px-4 py-3">

          <p className="text-sm font-medium">
            Content generation is running in the background.
          </p>

          <p className="mt-1 text-sm text-muted-foreground">
            Progress:{" "}
            {activeJob.days_done} /{" "}
            {activeJob.days_total} days
          </p>

          {activeJob.error && (
            <p className="mt-1 text-sm text-destructive">
              Last error: {activeJob.error}
            </p>
          )}

        </div>
      )}

      {view === "week" && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {REVIEW_TABS.map((t) => (
              <Button
                key={t.id}
                type="button"
                size="sm"
                variant={reviewTab === t.id ? "default" : "outline"}
                className="rounded-full"
                onClick={() => setReviewTab(t.id)}
              >
                {t.label} ({reviewCounts[t.id]})
              </Button>
            ))}
          </div>
          {reviewTab === "reviewed" && (
            <Button size="sm" onClick={() => void postSelected()} disabled={selectedItems.length === 0 || postProgress !== null}>
              {postProgress ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              {postProgress ? `Posting ${postProgress.done}/${postProgress.total}…` : selectedItems.length ? `Post now (${selectedItems.length})` : "Post now"}
            </Button>
          )}
        </div>
      )}

      {/* ====================================================== */}
      {/* CALENDAR */}
      {/* ====================================================== */}

      <div className="surface overflow-hidden">

        <div className="grid grid-cols-7 border-b border-border bg-card">

          {DOW.map((day, i) => (
            <div
              key={day}
              className="px-3 py-2 text-center text-xs uppercase tracking-wide text-muted-foreground"
            >
              {day}
              {view === "week" ? ` ${format(weekDays[i]!, "d MMM")}` : ""}
            </div>
          ))}

        </div>

        {isLoading ? (
          <div className="flex h-72 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : view === "week" ? (
          <div className="grid grid-cols-7">
            {weekDays.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const list = (byDate.get(key) ?? []).filter((i) => reviewTabOf(i) === reviewTab);
              return (
                <div key={key} className="min-h-[28rem] min-w-0 border-b border-r border-border p-2">
                  <div className="mb-2 flex items-center justify-between">
                    <span
                      className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                        isToday(day) ? "bg-primary font-semibold text-primary-foreground" : ""
                      }`}
                    >
                      {format(day, "d")}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {list.length} piece{list.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {list.length === 0 && (
                      <p className="pt-6 text-center text-[11px] text-muted-foreground">
                        {reviewTab === "generated" ? "Nothing to review" : reviewTab === "reviewed" ? "None reviewed" : "Nothing posted"}
                      </p>
                    )}
                    {list.map((item) => {
                      const raw = item.image_url ?? item.carousel_image_urls?.[0] ?? null;
                      const thumb = cachedMediaUrl(raw) ?? raw;
                      const rendering = item.status === "draft";
                      const isSelected = selectedIds.has(item.id);
                      return (
                        <div
                          key={item.id}
                          className={`relative overflow-hidden rounded-lg border transition-colors hover:border-primary/50 ${
                            isSelected ? "border-primary ring-1 ring-primary" : "border-border"
                          }`}
                        >
                          <button type="button" onClick={() => setDetail(item)} className="block w-full text-left">
                            <div className="relative aspect-square w-full bg-muted/20">
                              {thumb ? (
                                <img src={thumb} alt={item.title} className="h-full w-full object-cover" />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
                                  {rendering ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImageOff className="h-5 w-5" />}
                                </div>
                              )}
                              <Badge variant="outline" className={`absolute left-1.5 top-1.5 text-[10px] ${typeStyles[item.type] ?? ""}`}>
                                {item.type}
                              </Badge>
                            </div>
                            <div className="space-y-1 p-2 pb-1">
                              <p className="line-clamp-2 text-xs font-medium leading-snug">{item.title}</p>
                              <span className="text-[11px] text-muted-foreground">{item.scheduled_time?.slice(0, 5) ?? ""}</span>
                            </div>
                          </button>

                          {/* Bottom-right action */}
                          <div className="flex justify-end px-2 pb-2">
                            {reviewTab === "generated" && (
                              <Button size="sm" className="h-7 px-2.5 text-xs" disabled={rendering} onClick={() => setDetail(item)}>
                                {rendering ? "Generating…" : "Review"}
                              </Button>
                            )}
                            {reviewTab === "reviewed" && (
                              <Button size="sm" variant="secondary" className="h-7 gap-1 px-2 text-[11px] text-success" onClick={() => setDetail(item)}>
                                <CheckCircle2 className="h-3 w-3" /> Reviewed - Ready to Post
                              </Button>
                            )}
                            {reviewTab === "posted" && (
                              <Badge className="bg-success text-[10px] text-success-foreground">Posted</Badge>
                            )}
                          </div>

                          {reviewTab === "reviewed" && (
                            <div className="absolute right-1.5 top-1.5 z-10 rounded-md bg-background/80 p-1 shadow-sm backdrop-blur-sm">
                              <Checkbox
                                className="h-5 w-5"
                                checked={isSelected}
                                onCheckedChange={() =>
                                  setSelectedIds((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(item.id)) next.delete(item.id);
                                    else next.add(item.id);
                                    return next;
                                  })
                                }
                                aria-label={`Select “${item.title}” to post`}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-7">

            {days.map((day) => {

              const key =
                format(day, "yyyy-MM-dd");

              const list =
                byDate.get(key) ?? [];

              const outside =
                !isSameMonth(
                  day,
                  cursor,
                );

              const VIDEO_TYPES = [
                "instagram_reel",
                "youtube_short",
                "tiktok_video",
                "product_service_video",
              ];

              const blogCount = list.filter(
                (item) => item.type === "blog",
              ).length;
              const otherCount = list.length - blogCount;

              const failed =
                list.some(
                  (item) =>
                    VIDEO_TYPES.includes(item.type) &&
                    item.video_status ===
                      "failed",
                );

              const videoPaused =
                list.some(
                  (item) =>
                    VIDEO_TYPES.includes(item.type) &&
                    !item.video_url &&
                    item.video_status !==
                      "failed",
                );

              const ready =
                list.length > 0 &&
                list.every((item) => {
                  if (item.type === "blog") return true;
                  if (item.type === "carousel") {
                    const slideCount = item.carousel_slides?.length ?? 0;
                    const imageCount = (item.carousel_image_urls ?? []).filter(
                      Boolean,
                    ).length;
                    return slideCount > 0 && imageCount >= slideCount;
                  }
                  return Boolean(item.image_url);
                });

              return (
                <button
                  key={key}
                  onClick={() =>
                    setOpenDay(key)
                  }
                  className={`min-h-28 border-b border-r border-border p-2 text-left transition-colors hover:bg-accent ${
                    outside
                      ? "opacity-40"
                      : ""
                  }`}
                >

                  <span
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                      isToday(day)
                        ? "bg-primary font-semibold text-primary-foreground"
                        : ""
                    }`}
                  >
                    {format(day, "d")}
                  </span>

                  {list.length > 0 && (
                    <div className="mt-2 space-y-1">

                      {blogCount > 0 && (
                        <p className="truncate rounded bg-blog/15 px-1.5 py-0.5 text-[11px] text-blog">
                          {blogCount} blog
                        </p>
                      )}

                      {otherCount > 0 && (
                        <p className="truncate rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                          {otherCount} post{otherCount === 1 ? "" : "s"}
                        </p>
                      )}

                      {list.every(
                        (item) =>
                          !item.enabled,
                      ) && (
                        <p className="text-[11px] text-muted-foreground">
                          disabled
                        </p>
                      )}

                      <p
                        className={`text-[11px] font-medium ${
                          failed
                            ? "text-destructive"
                            : ready
                              ? "text-success"
                              : "text-primary"
                        }`}
                      >
                        {failed
                          ? "Rendering issue"
                          : !ready
                            ? "Rendering"
                            : videoPaused
                              ? "Ready · video paused"
                              : "Ready"}
                      </p>

                    </div>
                  )}

                </button>
              );
            })}

          </div>
        )}

      </div>

      {/* ====================================================== */}
      {/* DAY DETAILS */}
      {/* ====================================================== */}

      <Sheet
        open={Boolean(openDay)}
        onOpenChange={(open) =>
          !open &&
          setOpenDay(null)
        }
      >

        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">

          <SheetHeader>

            <SheetTitle>
              {openDay
                ? format(
                    parseISO(openDay),
                    "EEEE, d MMMM yyyy",
                  )
                : ""}
            </SheetTitle>

          </SheetHeader>

          {dayItems.length === 0 ? (
            <p className="px-4 text-sm text-muted-foreground">
              Nothing scheduled.
              Use “Generate Content”
              to fill this month.
            </p>
          ) : (
            <div className="space-y-3 px-4 pb-8">

              <div className="flex items-center justify-between rounded-lg border border-border p-3">

                <span className="text-sm">
                  Enable all content
                  for this day
                </span>

                <Switch
                  checked={dayItems.some(
                    (item) =>
                      item.enabled,
                  )}
                  onCheckedChange={(value) =>
                    openDay &&
                    toggleDay(
                      openDay,
                      value,
                    )
                  }
                />

              </div>

              {dayItems.map(
                (item) => (
                  <button
                    key={item.id}
                    onClick={() =>
                      setDetail(item)
                    }
                    className="w-full rounded-xl border border-border p-3 text-left transition-colors hover:bg-accent"
                  >

                    <div className="flex items-center gap-2">

                      <Badge
                        variant="outline"
                        className={
                          typeStyles[
                            item.type
                          ]
                        }
                      >
                        {item.type}
                      </Badge>

                      <span className="text-xs text-muted-foreground">
                        {item.scheduled_time?.slice(
                          0,
                          5,
                        )}
                      </span>

                      {!item.enabled && (
                        <Badge
                          variant="secondary"
                          className="ml-auto"
                        >
                          disabled
                        </Badge>
                      )}

                      {item.status ===
                        "posted" && (
                        <Badge className="ml-auto bg-success text-success-foreground">
                          posted
                        </Badge>
                      )}

                    </div>

                    <p className="mt-2 text-sm font-medium">
                      {item.title}
                    </p>

                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {item.summary ||
                        item.caption}
                    </p>

                    <div className="mt-2 flex flex-wrap gap-1">

                      {(item.platforms ??
                        []
                      ).map((platform) => (
                        <span
                          key={platform}
                          className="text-[11px] text-muted-foreground"
                        >
                          {platform}
                        </span>
                      ))}

                    </div>

                  </button>
                ),
              )}

            </div>
          )}

        </SheetContent>

      </Sheet>

      <ContentDetailDialog
        item={detail}
        {...(view === "week" ? { onFinishReview: (i: ContentItem) => void finishReview(i), finishing } : {})}
        onOpenChange={(open) =>
          !open &&
          setDetail(null)
        }
      />

    </div>
  );
}