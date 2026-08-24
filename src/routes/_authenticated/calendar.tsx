import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { createFileRoute } from "@tanstack/react-router";

import {
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

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
  processVideoQueueNow,
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

export const Route =
  createFileRoute(
    "/_authenticated/calendar",
  )({
    head: () => ({
      meta: [
        {
          title:
            "Content Calendar — LOVIZA",
        },
        {
          name: "description",
          content:
            "A month of blogs, infographics and videos scheduled day by day across channels.",
        },
        {
          property: "og:title",
          content:
            "Content Calendar — LOVIZA",
        },
        {
          property: "og:description",
          content:
            "Open any day to review, enable or disable scheduled content.",
        },
      ],
    }),

    component:
      CalendarPage,
  });

const DOW = [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
];

function CalendarPage() {
  const queryClient =
    useQueryClient();

  const [
    cursor,
    setCursor,
  ] = useState(() =>
    startOfMonth(
      new Date(),
    ),
  );

  const [
    openDay,
    setOpenDay,
  ] = useState<
    string | null
  >(null);

  const [
    detail,
    setDetail,
  ] =
    useState<ContentItem | null>(
      null,
    );

  const [
    queueing,
    setQueueing,
  ] = useState(false);

  const [
    posting,
    setPosting,
  ] = useState(false);

  const [
    clearing,
    setClearing,
  ] = useState(false);

  /*
   * Prevent two generation requests
   * from running at the same time.
   */
  const generationRunning =
    useRef(false);

  const monthKey =
    format(
      cursor,
      "yyyy-MM",
    );

  const monthStart =
    startOfMonth(cursor);

  const monthEnd =
    endOfMonth(cursor);

  const currentMonthKey =
    format(
      new Date(),
      "yyyy-MM",
    );

  const isCurrentMonth =
    monthKey ===
    currentMonthKey;

  const days = useMemo(
    () =>
      eachDayOfInterval({
        start:
          startOfWeek(
            monthStart,
            {
              weekStartsOn: 1,
            },
          ),

        end:
          endOfWeek(
            monthEnd,
            {
              weekStartsOn: 1,
            },
          ),
      }),
    [
      monthStart,
      monthEnd,
    ],
  );

  /*
   * Calendar content.
   */
  const {
    data: items = [],
    isLoading,
  } = useQuery({
    queryKey: [
      "content",
      monthKey,
    ],

    queryFn:
      async () => {
        const {
          data,
          error,
        } =
          await supabase
            .from(
              "content_items",
            )
            .select("*")
            .gte(
              "scheduled_date",
              format(
                monthStart,
                "yyyy-MM-dd",
              ),
            )
            .lte(
              "scheduled_date",
              format(
                monthEnd,
                "yyyy-MM-dd",
              ),
            )
            .order(
              "scheduled_time",
              {
                ascending:
                  true,
              },
            );

        if (error) {
          throw error;
        }

        return data as unknown as ContentItem[];
      },

    refetchInterval:
      (query) => {
        const current =
          (query.state.data ??
            []) as ContentItem[];

        const hasRenderingAssets =
          current.some(
            (item) =>
              (item.type !==
                "blog" &&
                !item.image_url) ||
              (item.type ===
                "video" &&
                !item.video_url &&
                item.video_status !==
                  "failed"),
          );

        return hasRenderingAssets
          ? 15_000
          : false;
      },
  });

  /*
   * Generation job.
   *
   * Poll much faster while generation
   * is active so the calendar updates.
   */
  const {
    data: activeJob,
  } = useQuery({
    queryKey: [
      "generation-job",
      monthKey,
    ],

    queryFn:
      async () => {
        const {
          data,
          error,
        } =
          await supabase
            .from(
              "content_generation_jobs",
            )
            .select(
              "id, status, days_done, days_total, error",
            )
            .eq(
              "month",
              monthKey,
            )
            .in(
              "status",
              [
                "pending",
                "running",
              ],
            )
            .maybeSingle();

        if (error) {
          throw error;
        }

        return data;
      },

    refetchInterval:
      (query) =>
        query.state.data
          ? 3_000
          : 15_000,
  });

  /*
   * Refresh calendar whenever the
   * generation job advances.
   */
  useEffect(() => {
    if (!activeJob) {
      return;
    }

    void queryClient.invalidateQueries(
      {
        queryKey: [
          "content",
          monthKey,
        ],
      },
    );
  }, [
    activeJob?.days_done,
    activeJob?.status,
    monthKey,
    queryClient,
  ]);

  /*
   * ============================================================
   * GENERATION WORKER
   * ============================================================
   *
   * The old code waited for the entire
   * generation process inside
   * queueMonthGeneration().
   *
   * This worker instead:
   *
   * 1. queueMonthGeneration() creates the job
   * 2. this worker processes ONE batch
   * 3. waits
   * 4. processes the next batch
   *
   * Therefore the Generate Content button
   * no longer waits for the whole month.
   */
  useEffect(() => {
    if (!activeJob) {
      return;
    }

    let stopped =
      false;

    const processNextBatch =
      async () => {
        if (
          stopped ||
          generationRunning.current
        ) {
          return;
        }

        generationRunning.current =
          true;

        try {
          const result =
            await processGenerationQueueNow();

          if (
            result?.error
          ) {
            console.error(
              "Generation batch error:",
              result.error,
            );
          }

          await queryClient.invalidateQueries(
            {
              queryKey: [
                "content",
                monthKey,
              ],
            },
          );

          await queryClient.invalidateQueries(
            {
              queryKey: [
                "generation-job",
                monthKey,
              ],
            },
          );
        } catch (error) {
          console.error(
            "Generation worker error:",
            error,
          );
        } finally {
          generationRunning.current =
            false;
        }
      };

    void processNextBatch();

    const timer =
      window.setInterval(
        () => {
          void processNextBatch();
        },
        2_000,
      );

    return () => {
      stopped = true;
      window.clearInterval(
        timer,
      );
    };
  }, [
    activeJob?.id,
    activeJob?.status,
    monthKey,
    queryClient,
  ]);

  /*
   * Sign every image/video for
   * the month up front.
   */
  useEffect(() => {
    if (!items.length) {
      return;
    }

    void prefetchMediaUrls(
      items.flatMap(
        (item) => [
          item.image_url,
          item.video_url,
        ],
      ),
    );
  }, [items]);

  /*
   * Group content by date.
   */
  const byDate =
    useMemo(() => {
      const map =
        new Map<
          string,
          ContentItem[]
        >();

      items.forEach(
        (item) => {
          const list =
            map.get(
              item.scheduled_date,
            ) ?? [];

          list.push(item);

          map.set(
            item.scheduled_date,
            list,
          );
        },
      );

      return map;
    }, [items]);

  /*
   * ============================================================
   * GENERATE MONTH
   * ============================================================
   */
  async function generateMonth() {
    if (
      queueing ||
      activeJob
    ) {
      return;
    }

    const monthDays =
      eachDayOfInterval({
        start:
          monthStart,
        end:
          monthEnd,
      }).map(
        (day) =>
          format(
            day,
            "yyyy-MM-dd",
          ),
      );

    setQueueing(true);

    try {
      /*
       * IMPORTANT:
       *
       * This now ONLY creates the durable job.
       * It returns immediately instead of
       * waiting for AI generation.
       */
      const result =
        await queueMonthGeneration(
          {
            data: {
              month:
                monthKey,
              dates:
                monthDays,
            },
          },
        );

      await queryClient.invalidateQueries(
        {
          queryKey: [
            "content",
            monthKey,
          ],
        },
      );

      await queryClient.invalidateQueries(
        {
          queryKey: [
            "generation-job",
            monthKey,
          ],
        },
      );

      const fromLabel =
        result?.from
          ? format(
              parseISO(
                result.from,
              ),
              "d MMM",
            )
          : null;

      toast.success(
        fromLabel
          ? `Generation started for ${result.queued} days from ${fromLabel}.`
          : `${format(
              cursor,
              "MMMM yyyy",
            )} generation started.`,
      );

      /*
       * Keep existing video queue
       * behaviour.
       */
      void processVideoQueueNow().catch(
        () => undefined,
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Generation failed",
      );
    } finally {
      setQueueing(false);
    }
  }

  /*
   * ============================================================
   * REFRESH CURRENT CALENDAR
   * ============================================================
   */
  async function refreshCalendar() {
    if (
      clearing ||
      !isCurrentMonth
    ) {
      if (!isCurrentMonth) {
        toast.info(
          "Refresh Calendar works only for the current month.",
        );
      }

      return;
    }

    const monthLabel =
      format(
        new Date(),
        "MMMM yyyy",
      );

    const confirmed =
      window.confirm(
        `Refresh ${monthLabel}?\n\n` +
          `This will permanently delete ALL generated ` +
          `content from the current month's calendar.\n\n` +
          `Brand Profile and connected social accounts ` +
          `will NOT be affected.`,
      );

    if (!confirmed) {
      return;
    }

    setClearing(true);

    try {
      /*
       * Server-side function deletes:
       *
       * - current month's content
       * - current month's generation job
       * - generated media
       *
       * It does NOT delete the Brand Profile
       * or social connections.
       */
      const result =
        await clearCurrentMonthContent();

      /*
       * Close any open calendar UI.
       */
      setOpenDay(null);
      setDetail(null);

      /*
       * Clear cached calendar data immediately.
       */
      queryClient.removeQueries(
        {
          queryKey: [
            "content",
            currentMonthKey,
          ],
        },
      );

      queryClient.removeQueries(
        {
          queryKey: [
            "generation-job",
            currentMonthKey,
          ],
        },
      );

      /*
       * Reload the empty calendar.
       */
      await Promise.all([
        queryClient.invalidateQueries(
          {
            queryKey: [
              "content",
              currentMonthKey,
            ],
          },
        ),

        queryClient.invalidateQueries(
          {
            queryKey: [
              "generation-job",
              currentMonthKey,
            ],
          },
        ),
      ]);

      toast.success(
        `Calendar refreshed. Deleted ${result.deleted} generated content item${
          result.deleted === 1
            ? ""
            : "s"
        }.`,
      );
    } catch (error) {
      console.error(
        "Calendar refresh failed:",
        error,
      );

      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to refresh calendar.",
      );
    } finally {
      setClearing(false);
    }
  }

  /*
   * ============================================================
   * POST CONTENT
   * ============================================================
   */
  async function postContent() {
    if (posting) {
      return;
    }

    setPosting(true);

    try {
      const result =
        await publishAllContent();

      await queryClient.invalidateQueries(
        {
          queryKey: [
            "content",
            monthKey,
          ],
        },
      );

      if (
        result.posted === 0
      ) {
        toast.info(
          "Nothing new to post — no due, unposted blogs found.",
        );
      } else {
        toast.success(
          `Posted ${result.posted} item${
            result.posted === 1
              ? ""
              : "s"
          } to your connected channels.`,
        );
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Posting failed",
      );
    } finally {
      setPosting(false);
    }
  }

  /*
   * ============================================================
   * ENABLE / DISABLE DAY
   * ============================================================
   */
  async function toggleDay(
    date: string,
    enabled: boolean,
  ) {
    const {
      error,
    } =
      await supabase
        .from(
          "content_items",
        )
        .update({
          enabled,
        })
        .eq(
          "scheduled_date",
          date,
        );

    if (error) {
      toast.error(
        error.message,
      );
    } else {
      toast.success(
        enabled
          ? "Day enabled"
          : "Day disabled",
      );

      await queryClient.invalidateQueries(
        {
          queryKey: [
            "content",
            monthKey,
          ],
        },
      );
    }
  }

  const dayItems =
    openDay
      ? byDate.get(
          openDay,
        ) ?? []
      : [];

  /*
   * Keep detail dialog synchronized
   * with refreshed calendar data.
   */
  useEffect(() => {
    if (!detail) {
      return;
    }

    const refreshed =
      items.find(
        (item) =>
          item.id ===
          detail.id,
      );

    if (
      refreshed &&
      refreshed !== detail
    ) {
      setDetail(
        refreshed,
      );
    }
  }, [
    detail,
    items,
  ]);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-bold">
            Content Calendar
          </h1>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() =>
                setCursor(
                  addMonths(
                    cursor,
                    -1,
                  ),
                )
              }
              disabled={
                queueing ||
                clearing
              }
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <span className="w-40 text-center font-display text-lg font-semibold">
              {format(
                cursor,
                "MMMM yyyy",
              )}
            </span>

            <Button
              variant="outline"
              size="icon"
              onClick={() =>
                setCursor(
                  addMonths(
                    cursor,
                    1,
                  ),
                )
              }
              disabled={
                queueing ||
                clearing
              }
            >
              <ChevronRight className="h-4 w-4" />
            </Button>

            <Button
              onClick={
                generateMonth
              }
              disabled={
                queueing ||
                Boolean(
                  activeJob,
                ) ||
                clearing
              }
            >
              {queueing ||
              activeJob ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}

              {activeJob
                ? `Generating ${activeJob.days_done}/${activeJob.days_total} days`
                : queueing
                  ? "Starting…"
                  : "Generate Content"}
            </Button>

            <Button
              variant="secondary"
              onClick={
                postContent
              }
              disabled={
                posting ||
                clearing
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

            <Button
              variant="outline"
              onClick={
                refreshCalendar
              }
              disabled={
                clearing ||
                posting ||
                queueing ||
                Boolean(
                  activeJob,
                ) ||
                !isCurrentMonth
              }
              title={
                !isCurrentMonth
                  ? "Refresh is available only for the current month"
                  : "Delete all generated content from the current month"
              }
            >
              {clearing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}

              {clearing
                ? "Refreshing…"
                : "Refresh Calendar"}
            </Button>
          </div>
        </div>

        <p className="mt-1 text-sm text-muted-foreground">
          Plan-based blogs,
          infographics and
          videos, generated
          from your brand
          profile.
        </p>
      </div>

      {activeJob && (
        <p className="text-sm text-muted-foreground">
          Generating content
          in batches:
          {" "}
          {activeJob.days_done}
          /
          {activeJob.days_total}
          {" "}
          days completed.
        </p>
      )}

      <div className="surface overflow-hidden">
        <div className="grid grid-cols-7 border-b border-border bg-card">
          {DOW.map(
            (day) => (
              <div
                key={day}
                className="px-3 py-2 text-center text-xs uppercase tracking-wide text-muted-foreground"
              >
                {day}
              </div>
            ),
          )}
        </div>

        {isLoading ? (
          <div className="flex h-72 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-7">
            {days.map(
              (day) => {
                const key =
                  format(
                    day,
                    "yyyy-MM-dd",
                  );

                const list =
                  byDate.get(
                    key,
                  ) ?? [];

                const outside =
                  !isSameMonth(
                    day,
                    cursor,
                  );

                const counts = {
                  blog:
                    list.filter(
                      (item) =>
                        item.type ===
                        "blog",
                    ).length,

                  infographic:
                    list.filter(
                      (item) =>
                        item.type ===
                        "infographic",
                    ).length,

                  video:
                    list.filter(
                      (item) =>
                        item.type ===
                        "video",
                    ).length,
                };

                const failed =
                  list.some(
                    (item) =>
                      item.type ===
                        "video" &&
                      item.video_status ===
                        "failed",
                  );

                const videoPaused =
                  list.some(
                    (item) =>
                      item.type ===
                        "video" &&
                      !item.video_url &&
                      item.video_status ===
                        "none",
                  );

                const ready =
                  list.length >
                    0 &&
                  list.every(
                    (item) =>
                      item.type ===
                        "blog" ||
                      Boolean(
                        item.image_url,
                      ),
                  );

                return (
                  <button
                    key={key}
                    onClick={() =>
                      setOpenDay(
                        key,
                      )
                    }
                    className={`min-h-28 border-b border-r border-border p-2 text-left transition-colors hover:bg-accent ${
                      outside
                        ? "opacity-40"
                        : ""
                    }`}
                  >
                    <span
                      className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                        isToday(
                          day,
                        )
                          ? "bg-primary font-semibold text-primary-foreground"
                          : ""
                      }`}
                    >
                      {format(
                        day,
                        "d",
                      )}
                    </span>

                    {list.length >
                      0 && (
                      <div className="mt-2 space-y-1">
                        {counts.blog >
                          0 && (
                          <p className="truncate rounded bg-blog/15 px-1.5 py-0.5 text-[11px] text-blog">
                            {
                              counts.blog
                            }{" "}
                            blog
                          </p>
                        )}

                        {counts.infographic >
                          0 && (
                          <p className="truncate rounded bg-infographic/15 px-1.5 py-0.5 text-[11px] text-infographic">
                            {
                              counts.infographic
                            }{" "}
                            infographics
                          </p>
                        )}

                        {counts.video >
                          0 && (
                          <p className="truncate rounded bg-video/15 px-1.5 py-0.5 text-[11px] text-video">
                            {
                              counts.video
                            }{" "}
                            videos
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
              },
            )}
          </div>
        )}
      </div>

      <Sheet
        open={Boolean(
          openDay,
        )}
        onOpenChange={(
          value,
        ) => {
          if (!value) {
            setOpenDay(
              null,
            );
          }
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>
              {openDay
                ? format(
                    parseISO(
                      openDay,
                    ),
                    "EEEE, d MMMM yyyy",
                  )
                : ""}
            </SheetTitle>
          </SheetHeader>

          {dayItems.length ===
          0 ? (
            <p className="px-4 text-sm text-muted-foreground">
              Nothing
              scheduled.
              Use
              “Generate
              Content”
              to fill
              this month.
            </p>
          ) : (
            <div className="space-y-3 px-4 pb-8">
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <span className="text-sm">
                  Enable all
                  content for
                  this day
                </span>

                <Switch
                  checked={dayItems.some(
                    (item) =>
                      item.enabled,
                  )}
                  onCheckedChange={(
                    value,
                  ) => {
                    if (
                      openDay
                    ) {
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
                    key={
                      item.id
                    }
                    onClick={() =>
                      setDetail(
                        item,
                      )
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
                        {
                          item.type
                        }
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
                      {
                        item.title
                      }
                    </p>

                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {
                        item.summary ||
                        item.caption
                      }
                    </p>

                    <div className="mt-2 flex flex-wrap gap-1">
                      {(
                        item.platforms ??
                        []
                      ).map(
                        (
                          platform,
                        ) => (
                          <span
                            key={
                              platform
                            }
                            className="text-[11px] text-muted-foreground"
                          >
                            {
                              platform
                            }
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
        onOpenChange={(
          value,
        ) => {
          if (!value) {
            setDetail(
              null,
            );
          }
        }}
      />
    </div>
  );
}