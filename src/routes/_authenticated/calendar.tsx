import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
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
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { prefetchMediaUrls } from "@/lib/media";
import {
  queueMonthGeneration,
  processGenerationQueueNow,
  clearCurrentMonthContent,
} from "@/lib/content.functions";
import { publishAllContent } from "@/lib/channels.functions";

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

const VIDEO_TYPES = [
  "instagram_reel",
  "youtube_short",
  "tiktok_video",
  "product_service_video",
];

function CalendarPage() {
  const queryClient = useQueryClient();

  const [cursor, setCursor] = useState(() =>
    startOfMonth(new Date()),
  );
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [detail, setDetail] = useState<ContentItem | null>(null);

  const [queueing, setQueueing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [posting, setPosting] = useState(false);

  const processingGeneration = useRef(false);

  const monthKey = format(cursor, "yyyy-MM");
  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);

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
   *
   * Poll while any content is still Rendering.
   */
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["content", monthKey],

    queryFn: async () => {
      const { data, error } = await supabase
        .from("content_items")
        .select("*")
        .gte(
          "scheduled_date",
          format(monthStart, "yyyy-MM-dd"),
        )
        .lte(
          "scheduled_date",
          format(monthEnd, "yyyy-MM-dd"),
        )
        .order("scheduled_date", {
          ascending: true,
        })
        .order("scheduled_time", {
          ascending: true,
        });

      if (error) throw error;

      return data as unknown as ContentItem[];
    },

    refetchInterval: (query) => {
      const current = (query.state.data ?? []) as ContentItem[];

      const hasRenderingItems = current.some((item) => {
        if (item.status === "failed") return false;
        if (item.status === "posted") return false;

        if (item.type === "blog") {
          return false;
        }

        if (item.type === "carousel") {
          const slideCount =
            item.carousel_slides?.length ?? 0;
          const imageCount = (
            item.carousel_image_urls ?? []
          ).filter(Boolean).length;

          return (
            slideCount > 0 &&
            imageCount < slideCount
          );
        }

        if (VIDEO_TYPES.includes(item.type)) {
          return (
            !item.image_url ||
            item.video_status === "generating"
          );
        }

        return !item.image_url;
      });

      return hasRenderingItems ? 2000 : false;
    },
  });

  /*
   * CURRENT GENERATION JOB
   *
   * Do not use maybeSingle() here because an old duplicate
   * job must not break the calendar query.
   */
  const { data: activeJob } = useQuery({
    queryKey: ["generation-job", monthKey],

    queryFn: async () => {
      const { data, error } = await supabase
        .from("content_generation_jobs")
        .select(
          "id, status, days_done, days_total, error, created_at",
        )
        .eq("month", monthKey)
        .in("status", ["pending", "running"])
        .order("created_at", {
          ascending: false,
        })
        .limit(1);

      if (error) throw error;

      return data?.[0] ?? null;
    },

    refetchInterval: (query) =>
      query.state.data ? 2000 : 5000,
  });

  /*
   * BACKGROUND GENERATION PUMP
   *
   * The Generate button only queues the job.
   * This effect performs the actual AI generation in the background.
   */
  useEffect(() => {
    if (
      !activeJob ||
      activeJob.status === "completed" ||
      activeJob.status === "failed"
    ) {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const processNextBatch = async () => {
      if (
        cancelled ||
        processingGeneration.current
      ) {
        return;
      }

      processingGeneration.current = true;

      try {
        const result =
          await processGenerationQueueNow();

        if (cancelled) return;

        /*
         * Immediately refresh both the calendar and progress.
         */
        await Promise.all([
          queryClient.refetchQueries({
            queryKey: ["content", monthKey],
          }),
          queryClient.refetchQueries({
            queryKey: ["generation-job", monthKey],
          }),
        ]);

        if (result?.cancelled) {
          return;
        }

        if (result?.error) {
          toast.error(result.error);
          return;
        }

        if (
          result?.generated &&
          !result?.completed &&
          !cancelled
        ) {
          timer = setTimeout(
            processNextBatch,
            250,
          );
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(
            error instanceof Error
              ? error.message
              : "Background generation failed.",
          );

          await Promise.all([
            queryClient.refetchQueries({
              queryKey: ["content", monthKey],
            }),
            queryClient.refetchQueries({
              queryKey: ["generation-job", monthKey],
            }),
          ]);
        }
      } finally {
        processingGeneration.current = false;
      }
    };

    void processNextBatch();

    return () => {
      cancelled = true;

      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [
    activeJob?.id,
    activeJob?.status,
    monthKey,
    queryClient,
  ]);

  /*
   * Prefetch generated media.
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
      const list =
        map.get(item.scheduled_date) ?? [];

      list.push(item);
      map.set(item.scheduled_date, list);
    });

    return map;
  }, [items]);

  /*
   * GENERATE MONTH
   *
   * The server function returns immediately after creating:
   * 1. Durable generation job
   * 2. Rendering calendar placeholders
   *
   * We force an immediate refetch so Rendering entries appear
   * without waiting for the AI process.
   */
  async function generateMonth() {
    if (
      queueing ||
      refreshing ||
      activeJob ||
      items.length > 0
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
      const result =
        await queueMonthGeneration({
          data: {
            month: monthKey,
            dates: monthDays,
          },
        });

      /*
       * CRITICAL:
       * Refetch immediately instead of only invalidating.
       */
      await Promise.all([
        queryClient.refetchQueries({
          queryKey: ["content", monthKey],
        }),
        queryClient.refetchQueries({
          queryKey: ["generation-job", monthKey],
        }),
      ]);

      toast.success(
        result?.queued
          ? `${result.queued} day${result.queued === 1 ? "" : "s"} queued. Content is now rendering in the background.`
          : "Content generation queued.",
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
   * Uses the existing authenticated server function so that:
   * - the generation job is removed first
   * - calendar content is deleted
   * - generated media is cleaned up
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
      const result =
        await clearCurrentMonthContent();

      setOpenDay(null);
      setDetail(null);

      await Promise.all([
        queryClient.refetchQueries({
          queryKey: ["content", monthKey],
        }),
        queryClient.refetchQueries({
          queryKey: ["generation-job", monthKey],
        }),
      ]);

      toast.success(
        `${format(
          cursor,
          "MMMM yyyy",
        )} calendar cleared.`,
      );

      void result;
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
  async function postContent() {
    if (posting) return;

    setPosting(true);

    try {
      const result =
        await publishAllContent();

      await queryClient.refetchQueries({
        queryKey: ["content", monthKey],
      });

      if (result.posted === 0) {
        toast.info(
          "Nothing new to post — no due, unposted blogs found.",
        );
      } else {
        toast.success(
          `Posted ${result.posted} item${
            result.posted === 1 ? "" : "s"
          } to your connected channels.`,
        );
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Posting failed.",
      );
    } finally {
      setPosting(false);
    }
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

    await queryClient.refetchQueries({
      queryKey: ["content", monthKey],
    });
  }

  const dayItems = openDay
    ? byDate.get(openDay) ?? []
    : [];

  /*
   * Keep opened detail synchronized.
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

  const hasCalendarContent =
    items.length > 0;

  const generateDisabled =
    queueing ||
    refreshing ||
    Boolean(activeJob) ||
    hasCalendarContent;

  return (
    <div className="space-y-6">
      {/* HEADER */}
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
          {/* PREVIOUS MONTH */}
          <Button
            variant="outline"
            size="icon"
            onClick={() =>
              setCursor(
                addMonths(cursor, -1),
              )
            }
            disabled={
              queueing ||
              refreshing ||
              Boolean(activeJob)
            }
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          {/* CURRENT MONTH */}
          <span className="w-40 text-center font-display text-lg font-semibold">
            {format(cursor, "MMMM yyyy")}
          </span>

          {/* NEXT MONTH */}
          <Button
            variant="outline"
            size="icon"
            onClick={() =>
              setCursor(
                addMonths(cursor, 1),
              )
            }
            disabled={
              queueing ||
              refreshing ||
              Boolean(activeJob)
            }
          >
            <ChevronRight className="h-4 w-4" />
          </Button>

          {/* GENERATE CONTENT */}
          <Button
            onClick={generateMonth}
            disabled={generateDisabled}
          >
            {queueing || activeJob ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}

            {queueing
              ? "Queueing…"
              : activeJob
                ? `Generating ${activeJob.days_done}/${activeJob.days_total}`
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

      {/* GENERATION STATUS */}
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

      {/* CALENDAR */}
      <div className="surface overflow-hidden">
        <div className="grid grid-cols-7 border-b border-border bg-card">
          {DOW.map((day) => (
            <div
              key={day}
              className="px-3 py-2 text-center text-xs uppercase tracking-wide text-muted-foreground"
            >
              {day}
            </div>
          ))}
        </div>

        {isLoading ? (
          <div className="flex h-72 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
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

              const blogCount =
                list.filter(
                  (item) =>
                    item.type === "blog",
                ).length;

              const otherCount =
                list.length -
                blogCount;

              const failed =
                list.some(
                  (item) =>
                    item.status === "failed" ||
                    (VIDEO_TYPES.includes(
                      item.type,
                    ) &&
                      item.video_status ===
                        "failed"),
                );

              const videoPaused =
                list.some(
                  (item) =>
                    VIDEO_TYPES.includes(
                      item.type,
                    ) &&
                    !item.video_url &&
                    item.video_status !==
                      "failed",
                );

              const ready =
                list.length > 0 &&
                list.every((item) => {
                  if (
                    item.status ===
                    "failed"
                  ) {
                    return false;
                  }

                  if (
                    item.type === "blog"
                  ) {
                    return true;
                  }

                  if (
                    item.type ===
                    "carousel"
                  ) {
                    const slideCount =
                      item.carousel_slides
                        ?.length ?? 0;

                    const imageCount = (
                      item.carousel_image_urls ??
                      []
                    ).filter(
                      Boolean,
                    ).length;

                    return (
                      slideCount > 0 &&
                      imageCount >=
                        slideCount
                    );
                  }

                  return Boolean(
                    item.image_url,
                  );
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
                          {otherCount} post
                          {otherCount === 1
                            ? ""
                            : "s"}
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

      {/* DAY DETAILS */}
      <Sheet
        open={Boolean(openDay)}
        onOpenChange={(open) => {
          if (!open) {
            setOpenDay(null);
          }
        }}
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
                  onCheckedChange={(
                    value,
                  ) => {
                    if (openDay) {
                      void toggleDay(
                        openDay,
                        value,
                      );
                    }
                  }}
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
                      {(
                        item.platforms ??
                        []
                      ).map(
                        (platform) => (
                          <span
                            key={platform}
                            className="text-[11px] text-muted-foreground"
                          >
                            {platform}
                          </span>
                        ),
                      )}
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
        onOpenChange={(open) => {
          if (!open) {
            setDetail(null);
          }
        }}
      />
    </div>
  );
}
