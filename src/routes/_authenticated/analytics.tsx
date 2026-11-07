import { useBrandScope } from "@/lib/brand-scope";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { syncMyMetrics } from "@/lib/channels.functions";
import { Button } from "@/components/ui/button";
import { format, subDays } from "date-fns";
import { Loader2, Eye, MousePointerClick, Heart, Send, Sparkles, RefreshCw } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — LOVIZA" },
      {
        name: "description",
        content: "Impressions, clicks and engagement across every generated content type.",
      },
      { property: "og:title", content: "Analytics — LOVIZA" },
      {
        property: "og:description",
        content: "See which content types and channels are performing this month.",
      },
    ],
  }),
  component: AnalyticsPage,
});

const CHART_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Eye;
  label: string;
  value: string | number;
}) {
  return (
    <div className="surface p-5">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="text-xs uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-3 font-display text-3xl font-bold">{value}</p>
    </div>
  );
}

function AnalyticsPage() {
  const scope = useBrandScope();
  const brandFilter = scope.brandId ? { brand_id: scope.brandId } : {};
  const { data, isLoading } = useQuery({
    queryKey: ["analytics", scope.brandId],
    enabled: !scope.loading,
    queryFn: async () => {
      const from = format(subDays(new Date(), 29), "yyyy-MM-dd");
      const { data: rows, error } = await supabase
        .from("content_items")
        .select("id, title, scheduled_date, type, status, platforms, impressions, clicks, engagements, metrics_updated_at")
        .match(brandFilter)
        .gte("scheduled_date", from)
        .order("scheduled_date");
      if (error) throw error;
      return rows ?? [];
    },
  });

  // Real numbers pulled from the social platforms (one row per post, channel and age).
  const { data: perf } = useQuery({
    queryKey: ["analytics-perf", scope.brandId],
    enabled: !scope.loading,
    queryFn: async () => {
      const from = format(subDays(new Date(), 29), "yyyy-MM-dd");
      const { data: items, error: itemsError } = await supabase
        .from("content_items")
        .select("id, title, type, scheduled_date")
        .match(brandFilter)
        .gte("scheduled_date", from);
      if (itemsError) throw itemsError;
      const ids = (items ?? []).map((i) => i.id);
      if (ids.length === 0) return { items: items ?? [], snaps: [], logs: [] };
      const [{ data: snaps, error: snapError }, { data: logs, error: logError }] =
        await Promise.all([
          supabase
            .from("post_metric_snapshots")
            .select(
              "publish_log_id, content_item_id, channel, bucket, ok, impressions, clicks, engagements, fetched_at",
            )
            .in("content_item_id", ids),
          supabase
            .from("publish_log")
            .select("id, content_item_id, channel, status")
            .in("content_item_id", ids),
        ]);
      if (snapError) throw snapError;
      if (logError) throw logError;
      return { items: items ?? [], snaps: snaps ?? [], logs: logs ?? [] };
    },
  });

  const queryClient = useQueryClient();
  const syncNow = useServerFn(syncMyMetrics);
  const sync = useMutation({
    mutationFn: () => syncNow({}),
    onSuccess: (r) => {
      toast.success(
        r.captured > 0
          ? `Pulled fresh numbers for ${r.captured} post${r.captured === 1 ? "" : "s"}.`
          : "Checked your posts. No new numbers are available yet.",
      );
      void queryClient.invalidateQueries({ queryKey: ["analytics"] });
      void queryClient.invalidateQueries({ queryKey: ["analytics-perf"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Sync failed."),
  });

  const { data: strategies } = useQuery({
    queryKey: ["strategies", scope.brandId],
    enabled: !scope.loading,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("content_strategies")
        .select("id, week_start, week_end, insights, directives, rebuilt_dates")
        .match(brandFilter)
        .order("week_start", { ascending: false })
        .limit(4);
      if (error) throw error;
      return rows ?? [];
    },
  });


  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const rows = data ?? [];
  const totals = rows.reduce(
    (acc, r) => ({
      impressions: acc.impressions + (r.impressions ?? 0),
      clicks: acc.clicks + (r.clicks ?? 0),
      engagements: acc.engagements + (r.engagements ?? 0),
      posted: acc.posted + (r.status === "posted" ? 1 : 0),
    }),
    { impressions: 0, clicks: 0, engagements: 0, posted: 0 },
  );

  const byDay = Object.values(
    rows.reduce<Record<string, { date: string; impressions: number; clicks: number }>>(
      (acc, r) => {
        const key = r.scheduled_date;
        acc[key] ??= { date: format(new Date(key), "d MMM"), impressions: 0, clicks: 0 };
        acc[key].impressions += r.impressions ?? 0;
        acc[key].clicks += r.clicks ?? 0;
        return acc;
      },
      {},
    ),
  );

  const CONTENT_TYPES = [
    "linkedin_post",
    "instagram_post",
    "instagram_reel",
    "facebook_post",
    "youtube_short",
    "twitter_post",
    "carousel",
    "blog",
    "product_service_video",
    "tiktok_video",
    "pinterest",
  ];

  const TYPE_SHORT_LABEL: Record<string, string> = {
    linkedin_post: "LinkedIn",
    instagram_post: "IG Post",
    instagram_reel: "IG Reel",
    facebook_post: "Facebook",
    youtube_short: "YT Short",
    twitter_post: "X",
    carousel: "Carousel",
    blog: "Blog",
    product_service_video: "Product Video",
    tiktok_video: "TikTok",
    pinterest: "Pinterest",
  };

  const byType = CONTENT_TYPES.map((type) => ({
    type: TYPE_SHORT_LABEL[type] ?? type,
    pieces: rows.filter((r) => r.type === type).length,
    impressions: rows
      .filter((r) => r.type === type)
      .reduce((s, r) => s + (r.impressions ?? 0), 0),
  }));

  const platformCounts: Record<string, number> = {};
  rows.forEach((r) => (r.platforms ?? []).forEach((p) => (platformCounts[p] = (platformCounts[p] ?? 0) + 1)));
  const byPlatform = Object.entries(platformCounts).map(([name, value]) => ({ name, value }));

  // ---- Performance from the platforms --------------------------------------------
  const BUCKET_ORDER: Record<string, number> = { h24: 1, h72: 2, d7: 3, d14: 4 };
  const itemById = new Map((perf?.items ?? []).map((i) => [i.id, i]));
  const latestByLog = new Map<string, NonNullable<typeof perf>["snaps"][number]>();
  for (const sn of perf?.snaps ?? []) {
    if (!sn.ok) continue;
    const cur = latestByLog.get(sn.publish_log_id);
    if (!cur || (BUCKET_ORDER[sn.bucket] ?? 0) > (BUCKET_ORDER[cur.bucket] ?? 0)) {
      latestByLog.set(sn.publish_log_id, sn);
    }
  }
  const measured = [...latestByLog.values()];
  const rate = (eng: number, imp: number) => (imp > 0 ? (eng / imp) * 100 : 0);

  const channelStats = Object.values(
    measured.reduce<
      Record<string, { channel: string; posts: number; impressions: number; clicks: number; engagements: number }>
    >((acc, m) => {
      const c = (acc[m.channel] ??= {
        channel: m.channel,
        posts: 0,
        impressions: 0,
        clicks: 0,
        engagements: 0,
      });
      c.posts += 1;
      c.impressions += m.impressions;
      c.clicks += m.clicks;
      c.engagements += m.engagements;
      return acc;
    }, {}),
  ).sort((a, b) => b.engagements - a.engagements);

  const typeStats = Object.values(
    measured.reduce<Record<string, { type: string; posts: number; impressions: number; engagements: number }>>(
      (acc, m) => {
        const t = itemById.get(m.content_item_id)?.type ?? "unknown";
        const c = (acc[t] ??= { type: t, posts: 0, impressions: 0, engagements: 0 });
        c.posts += 1;
        c.impressions += m.impressions;
        c.engagements += m.engagements;
        return acc;
      },
      {},
    ),
  ).sort((a, b) => rate(b.engagements, b.impressions) - rate(a.engagements, a.impressions));

  const topPosts = [...measured]
    .filter((m) => m.impressions > 0)
    .sort((a, b) => rate(b.engagements, b.impressions) - rate(a.engagements, a.impressions))
    .slice(0, 5);

  const postedLogs = (perf?.logs ?? []).filter((l) => l.status === "posted");
  const failedProbes = new Set(
    (perf?.snaps ?? []).filter((s) => !s.ok).map((s) => s.publish_log_id),
  );
  const statusByChannel = Object.values(
    postedLogs.reduce<Record<string, { channel: string; posted: number; measured: number; blocked: number }>>(
      (acc, l) => {
        const c = (acc[l.channel] ??= { channel: l.channel, posted: 0, measured: 0, blocked: 0 });
        c.posted += 1;
        if (latestByLog.has(l.id)) c.measured += 1;
        else if (failedProbes.has(l.id)) c.blocked += 1;
        return acc;
      },
      {},
    ),
  );
  const lastUpdated = (perf?.snaps ?? []).reduce<string | null>(
    (max, s) => (!max || s.fetched_at > max ? s.fetched_at : max),
    null,
  );
  const SUPPORTED = ["LinkedIn", "Facebook", "Instagram", "X", "YouTube", "Pinterest"];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your Brand Content Performance for the last 30 days of scheduled content.
        </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Button variant="outline" size="sm" onClick={() => sync.mutate()} disabled={sync.isPending}>
            {sync.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Sync now
          </Button>
          <span className="text-xs text-muted-foreground">
            {lastUpdated
              ? `Last pulled ${format(new Date(lastUpdated), "d MMM, HH:mm")}`
              : "No platform numbers pulled yet"}
          </span>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Eye} label="Impressions" value={totals.impressions.toLocaleString()} />
        <Stat icon={MousePointerClick} label="Clicks" value={totals.clicks.toLocaleString()} />
        <Stat icon={Heart} label="Engagements" value={totals.engagements.toLocaleString()} />
        <Stat icon={Send} label="Posted pieces" value={totals.posted} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="surface p-5">
          <h2 className="text-sm font-semibold">Performance by channel</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Real numbers from the platforms, for posts published through LOVIZA.
          </p>
          {channelStats.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              Nothing measured yet. Numbers appear about a day after a post goes live and are
              refreshed at 3 days, 7 days and 14 days.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3">Channel</th>
                    <th className="py-2 pr-3">Posts</th>
                    <th className="py-2 pr-3">Impressions</th>
                    <th className="py-2 pr-3">Clicks</th>
                    <th className="py-2 pr-3">Engagement</th>
                  </tr>
                </thead>
                <tbody>
                  {channelStats.map((c) => (
                    <tr key={c.channel} className="border-t border-border">
                      <td className="py-2 pr-3 font-medium">{c.channel}</td>
                      <td className="py-2 pr-3">{c.posts}</td>
                      <td className="py-2 pr-3">{c.impressions.toLocaleString()}</td>
                      <td className="py-2 pr-3">{c.clicks.toLocaleString()}</td>
                      <td className="py-2 pr-3">
                        {c.engagements.toLocaleString()}{" "}
                        <span className="text-xs text-muted-foreground">
                          ({rate(c.engagements, c.impressions).toFixed(1)}%)
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="surface p-5">
          <h2 className="text-sm font-semibold">Best performing posts</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Ranked by engagement rate. The weekly strategy learns from these.
          </p>
          {topPosts.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">No measured posts yet.</p>
          ) : (
            <ol className="mt-4 space-y-3">
              {topPosts.map((m, i) => {
                const item = itemById.get(m.content_item_id);
                return (
                  <li key={`${m.publish_log_id}`} className="flex items-start gap-3 text-sm">
                    <span className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{item?.title ?? "Post"}</p>
                      <p className="text-xs text-muted-foreground">
                        {m.channel} · {rate(m.engagements, m.impressions).toFixed(1)}% engagement ·{" "}
                        {m.impressions.toLocaleString()} impressions
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>

      {typeStats.length > 0 && (
        <div className="surface p-5">
          <h2 className="text-sm font-semibold">What works best</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {typeStats.map((t) => (
              <div key={t.type} className="rounded-xl border border-border p-3">
                <p className="text-xs text-muted-foreground">{t.type.replace(/_/g, " ")}</p>
                <p className="mt-1 font-display text-xl font-bold">
                  {rate(t.engagements, t.impressions).toFixed(1)}%
                </p>
                <p className="text-xs text-muted-foreground">
                  {t.posts} post{t.posts === 1 ? "" : "s"}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="surface p-5">
        <h2 className="text-sm font-semibold">Measurement status</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Which channels LOVIZA can read numbers from. Anything not measured is never counted as
          zero, so it cannot mislead the strategy.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {SUPPORTED.map((ch) => {
            const st = statusByChannel.find((s) => s.channel === ch);
            const label = !st
              ? "no posts yet"
              : st.measured > 0
                ? `${st.measured} of ${st.posted} measured`
                : st.blocked > 0
                  ? "platform blocked access"
                  : "waiting for first numbers";
            return (
              <span key={ch} className="rounded-full border border-border px-3 py-1 text-xs">
                <span className="font-medium">{ch}</span>{" "}
                <span className="text-muted-foreground">· {label}</span>
              </span>
            );
          })}
          <span className="rounded-full border border-dashed border-border px-3 py-1 text-xs text-muted-foreground">
            TikTok, Threads, Quora, Medium · not measurable yet
          </span>
        </div>
      </div>

      <div className="surface p-5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Weekly strategy loop</h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Every week the system studies reach, clicks and engagement, rewrites the strategy, and
          rebuilds the remaining days of the month against it — automatically.
        </p>
        {!strategies?.length ? (
          <p className="mt-4 text-sm text-muted-foreground">
            No weekly review yet. Once a week of posted content has performance data, the first
            strategy update will appear here.
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            {strategies.map((s) => (
              <div key={s.id} className="rounded-xl border border-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Week of {format(new Date(s.week_start), "d MMM")} –{" "}
                    {format(new Date(s.week_end), "d MMM")}
                  </span>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
                    {(s.rebuilt_dates ?? []).length} upcoming days rebuilt
                  </span>
                </div>
                <p className="mt-3 text-sm">{s.insights}</p>
                <p className="mt-2 text-sm text-muted-foreground">{s.directives}</p>
              </div>
            ))}
          </div>
        )}
      </div>



      {rows.length === 0 ? (
        <div className="surface p-10 text-center text-sm text-muted-foreground">
          No content yet. Generate a month from the Content Calendar to start tracking performance.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="surface p-5 lg:col-span-2">
            <h2 className="text-sm font-semibold">Reach over time</h2>
            <div className="mt-4 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={byDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="date" stroke="var(--color-muted-foreground)" fontSize={11} />
                  <YAxis stroke="var(--color-muted-foreground)" fontSize={11} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-card)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 12,
                    }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="impressions"
                    stroke="var(--color-chart-1)"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="clicks"
                    stroke="var(--color-chart-2)"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="surface p-5">
            <h2 className="text-sm font-semibold">Planned mix by channel</h2>
            <div className="mt-4 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={byPlatform} dataKey="value" nameKey="name" outerRadius={90} label>
                    {byPlatform.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-card)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 12,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="surface p-5 lg:col-span-3">
            <h2 className="text-sm font-semibold">Pieces planned by content type</h2>
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byType} margin={{ bottom: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis
                    dataKey="type"
                    stroke="var(--color-muted-foreground)"
                    fontSize={11}
                    angle={-35}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis stroke="var(--color-muted-foreground)" fontSize={11} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-card)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 12,
                    }}
                  />
                  <Bar dataKey="pieces" fill="var(--color-chart-1)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
