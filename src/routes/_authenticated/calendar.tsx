import { useEffect, useMemo, useState } from "react";
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
import { ChevronLeft, ChevronRight, Loader2, Send, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { prefetchMediaUrls } from "@/lib/media";
import {
  queueMonthGeneration,
  processVideoQueueNow,
} from "@/lib/content.functions";
import { publishAllContent } from "@/lib/channels.functions";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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
        content: "A month of blogs, infographics and videos scheduled day by day across channels.",
      },
      { property: "og:title", content: "Content Calendar — LOVIZA" },
      {
        property: "og:description",
        content: "Open any day to review, enable or disable scheduled content.",
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
  const [posting, setPosting] = useState(false);


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

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["content", monthKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("content_items")
        .select("*")
        .gte("scheduled_date", format(monthStart, "yyyy-MM-dd"))
        .lte("scheduled_date", format(monthEnd, "yyyy-MM-dd"))
        .order("scheduled_time", { ascending: true });
      if (error) throw error;
      return data as unknown as ContentItem[];
    },
    refetchInterval: (query) => {
      const current = (query.state.data ?? []) as ContentItem[];
      const hasRenderingAssets = current.some(
        (item) =>
          (item.type !== "blog" && !item.image_url) ||
          (item.type === "video" && !item.video_url && item.video_status !== "failed"),
      );
      return hasRenderingAssets ? 15_000 : false;
    },
  });

  // The month job lives in the database, so progress survives reloads, logouts
  // and navigation — this only reads it.
  const { data: activeJob } = useQuery({
    queryKey: ["generation-job", monthKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("content_generation_jobs")
        .select("id, status, days_done, days_total, error")
        .eq("month", monthKey)
        .in("status", ["pending", "running"])
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    refetchInterval: (query) => (query.state.data ? 10_000 : 30_000),
  });

  // Refresh the grid while the backend keeps writing new days.
  useEffect(() => {
    if (!activeJob) return;
    queryClient.invalidateQueries({ queryKey: ["content", monthKey] });
  }, [activeJob?.days_done, activeJob, monthKey, queryClient]);

  // Sign every image/video for the month up front so a day opens instantly.
  useEffect(() => {
    if (!items.length) return;
    void prefetchMediaUrls(items.flatMap((i) => [i.image_url, i.video_url]));
  }, [items]);

  const byDate = useMemo(() => {
    const map = new Map<string, ContentItem[]>();
    items.forEach((item) => {
      const list = map.get(item.scheduled_date) ?? [];
      list.push(item);
      map.set(item.scheduled_date, list);
    });
    return map;
  }, [items]);

  async function generateMonth() {
    const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd }).map((d) =>
      format(d, "yyyy-MM-dd"),
    );
    setQueueing(true);
    try {
      // The month is handed to a durable backend job. Only today onwards is
      // regenerated, so mid-month brand-profile updates (new products, services
      // or events) are reflected across every remaining day.
      const result = await queueMonthGeneration({ data: { month: monthKey, dates: monthDays } });
      await queryClient.invalidateQueries({ queryKey: ["content", monthKey] });
      await queryClient.invalidateQueries({ queryKey: ["generation-job", monthKey] });
      const fromLabel = result?.from ? format(parseISO(result.from), "d MMM") : null;
      toast.success(
        fromLabel
          ? `Refreshing ${result.queued} days from ${fromLabel} with your latest Brand Profile — you can close the app`
          : `${format(cursor, "MMMM yyyy")} is generating in the background — you can close the app`,
      );
      void processVideoQueueNow().catch(() => undefined);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setQueueing(false);
    }
  }



  async function postContent() {
    setPosting(true);
    try {
      // Posts every not-yet-posted blog scheduled today or earlier, to
      // every connected channel that supports blogs (LinkedIn, Website,
      // and Quora/Medium if a manual handle is set in Brand Profile).
      const result = await publishAllContent();
      await queryClient.invalidateQueries({ queryKey: ["content", monthKey] });
      if (result.posted === 0) {
        toast.info("Nothing new to post — no due, unposted blogs found.");
      } else {
        toast.success(
          `Posted ${result.posted} item${result.posted === 1 ? "" : "s"} to your connected channels.`,
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Posting failed");
    } finally {
      setPosting(false);
    }
  }



  async function toggleDay(date: string, enabled: boolean) {
    const { error } = await supabase
      .from("content_items")
      .update({ enabled })
      .eq("scheduled_date", date);
    if (error) toast.error(error.message);
    else {
      toast.success(enabled ? "Day enabled" : "Day disabled");
      queryClient.invalidateQueries({ queryKey: ["content", monthKey] });
    }
  }

  const dayItems = openDay ? (byDate.get(openDay) ?? []) : [];

  useEffect(() => {
    if (!detail) return;
    const refreshed = items.find((item) => item.id === detail.id);
    if (refreshed && refreshed !== detail) setDetail(refreshed);
  }, [detail, items]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Content Calendar</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Plan-based blogs, infographics and videos, generated from your brand profile.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setCursor(addMonths(cursor, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="w-40 text-center font-display text-lg font-semibold">
            {format(cursor, "MMMM yyyy")}
          </span>
          <Button variant="outline" size="icon" onClick={() => setCursor(addMonths(cursor, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button onClick={generateMonth} disabled={queueing || Boolean(activeJob)}>
            {queueing || activeJob ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            {activeJob
              ? `Generating ${activeJob.days_done}/${activeJob.days_total} days`
              : queueing
                ? "Queueing…"
                : "Generate Content"}
          </Button>
          <Button variant="secondary" onClick={postContent} disabled={posting}>
            {posting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            {posting ? "Posting…" : "Post Content"}
          </Button>
        </div>
      </div>

      {activeJob && (
        <p className="text-sm text-muted-foreground">
          Generation runs on our servers — you can close this page or log out and it will keep going
          until every day of {format(cursor, "MMMM yyyy")} is written and rendered.
        </p>
      )}


      <div className="surface overflow-hidden">
        <div className="grid grid-cols-7 border-b border-border bg-card">
          {DOW.map((d) => (
            <div
              key={d}
              className="px-3 py-2 text-center text-xs uppercase tracking-wide text-muted-foreground"
            >
              {d}
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
              const key = format(day, "yyyy-MM-dd");
              const list = byDate.get(key) ?? [];
              const outside = !isSameMonth(day, cursor);
              const counts = {
                blog: list.filter((i) => i.type === "blog").length,
                infographic: list.filter((i) => i.type === "infographic").length,
                video: list.filter((i) => i.type === "video").length,
              };
              const failed = list.some(
                (item) => item.type === "video" && item.video_status === "failed",
              );
              const videoPaused = list.some(
                (item) => item.type === "video" && !item.video_url && item.video_status === "none",
              );
              const ready =
                list.length > 0 &&
                list.every((item) => item.type === "blog" || Boolean(item.image_url));
              return (
                <button
                  key={key}
                  onClick={() => setOpenDay(key)}
                  className={`min-h-28 border-b border-r border-border p-2 text-left transition-colors hover:bg-accent ${
                    outside ? "opacity-40" : ""
                  }`}
                >
                  <span
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                      isToday(day) ? "bg-primary font-semibold text-primary-foreground" : ""
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
                      {counts.infographic > 0 && (
                        <p className="truncate rounded bg-infographic/15 px-1.5 py-0.5 text-[11px] text-infographic">
                          {counts.infographic} infographics
                        </p>
                      )}
                      {counts.video > 0 && (
                        <p className="truncate rounded bg-video/15 px-1.5 py-0.5 text-[11px] text-video">
                          {counts.video} videos
                        </p>
                      )}
                      {list.every((i) => !i.enabled) && (
                        <p className="text-[11px] text-muted-foreground">disabled</p>
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

      <Sheet open={Boolean(openDay)} onOpenChange={(v) => !v && setOpenDay(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>
              {openDay ? format(parseISO(openDay), "EEEE, d MMMM yyyy") : ""}
            </SheetTitle>
          </SheetHeader>

          {dayItems.length === 0 ? (
            <p className="px-4 text-sm text-muted-foreground">
              Nothing scheduled. Use “Generate Content” to fill this month.
            </p>
          ) : (
            <div className="space-y-3 px-4 pb-8">
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <span className="text-sm">Enable all content for this day</span>
                <Switch
                  checked={dayItems.some((i) => i.enabled)}
                  onCheckedChange={(v) => openDay && toggleDay(openDay, v)}
                />
              </div>
              {dayItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setDetail(item)}
                  className="w-full rounded-xl border border-border p-3 text-left transition-colors hover:bg-accent"
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={typeStyles[item.type]}>
                      {item.type}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {item.scheduled_time?.slice(0, 5)}
                    </span>
                    {!item.enabled && (
                      <Badge variant="secondary" className="ml-auto">
                        disabled
                      </Badge>
                    )}
                    {item.status === "posted" && (
                      <Badge className="ml-auto bg-success text-success-foreground">posted</Badge>
                    )}
                  </div>
                  <p className="mt-2 text-sm font-medium">{item.title}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {item.summary || item.caption}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {(item.platforms ?? []).map((p) => (
                      <span key={p} className="text-[11px] text-muted-foreground">
                        {p}
                      </span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          )}
        </SheetContent>
      </Sheet>

      <ContentDetailDialog item={detail} onOpenChange={(v) => !v && setDetail(null)} />
    </div>
  );
}
