import { useEffect, useMemo, useState, useRef, } from "react";
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
import { queueMonthGeneration, processGenerationQueueNow } from "@/lib/content.functions";
import { publishAllContent } from "@/lib/channels.functions";
import { isVideoType, isImageType } from "@/lib/content/types";

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
          "A month of blogs, social posts, carousels and videos scheduled day by day across channels.",
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

function CalendarPage() {
  const queryClient = useQueryClient();

  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
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
        .order("scheduled_time", {
          ascending: true,
        });

      if (error) throw error;

      return data as unknown as ContentItem[];
    },

    refetchInterval: (query) => {
      const current = (query.state.data ?? []) as ContentItem[];

      const hasRenderingAssets = current.some((item) => {
        if (item.type === "blog") return false;

        if (item.type === "carousel") {
          return !(item.carousel_image_urls && item.carousel_image_urls.length > 0);
        }

        if (isVideoType(item.type)) {
          return !item.video_url && item.video_status !== "failed";
        }

        // Static image types (linkedin_post, instagram_post, facebook_post,
        // twitter_post, pinterest).
        return !item.image_url;
      });

      return hasRenderingAssets ? 15000 : false;
    },
  });

  /*
   * CURRENT GENERATION JOB
   */
  const { data: activeJob } = useQuery({
    queryKey: ["generation-job", monthKey],

    queryFn: async () => {
      const { data, error } = await supabase
        .from("content_generation_jobs")
        .select(
          "id, status, days_done, days_total, error",
        )
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
  async function postContent() {
    if (posting) return;

    setPosting(true);

    try {
      const result = await publishAllContent();

      await queryClient.invalidateQueries({
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

  const hasCalendarContent = items.length > 0;

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
            Blogs, social posts, carousels and videos,
            generated from your brand profile.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">

          {/* Previous Month */}
          <Button
            variant="outline"
            size="icon"
            onClick={() =>
              setCursor(
                addMonths(cursor, -1),
              )
            }
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          {/* Current Month */}
          <span className="w-40 text-center font-display text-lg font-semibold">
            {format(cursor, "MMMM yyyy")}
          </span>

          {/* Next Month */}
          <Button
            variant="outline"
            size="icon"
            onClick={() =>
              setCursor(
                addMonths(cursor, 1),
              )
            }
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

      {/* ====================================================== */}
      {/* CALENDAR */}
      {/* ====================================================== */}

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

              const counts = {
                blog: list.filter(
                  (item) =>
                    item.type === "blog",
                ).length,

                carousel: list.filter(
                  (item) =>
                    item.type === "carousel",
                ).length,

                social: list.filter(
                  (item) =>
                    isImageType(item.type),
                ).length,

                video: list.filter(
                  (item) =>
                    isVideoType(item.type),
                ).length,
              };

              const failed =
                list.some(
                  (item) =>
                    isVideoType(item.type) &&
                    item.video_status ===
                      "failed",
                );

              const videoPaused =
                list.some(
                  (item) =>
                    isVideoType(item.type) &&
                    !item.video_url &&
                    item.video_status ===
                      "none",
                );

              const ready =
                list.length > 0 &&
                list.every((item) => {
                  if (item.type === "blog") return true;

                  if (item.type === "carousel") {
                    return Boolean(
                      item.carousel_image_urls &&
                        item.carousel_image_urls.length > 0,
                    );
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

                      {counts.blog > 0 && (
                        <p className="truncate rounded bg-blog/15 px-1.5 py-0.5 text-[11px] text-blog">
                          {counts.blog} blog
                        </p>
                      )}

                      {counts.carousel > 0 && (
                        <p className="truncate rounded bg-blog/15 px-1.5 py-0.5 text-[11px] text-blog">
                          {counts.carousel} carousel
                        </p>
                      )}

                      {counts.social > 0 && (
                        <p className="truncate rounded bg-infographic/15 px-1.5 py-0.5 text-[11px] text-infographic">
                          {counts.social} social posts
                        </p>
                      )}

                      {counts.video > 0 && (
                        <p className="truncate rounded bg-video/15 px-1.5 py-0.5 text-[11px] text-video">
                          {counts.video} videos
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
        onOpenChange={(open) =>
          !open &&
          setDetail(null)
        }
      />

    </div>
  );
}