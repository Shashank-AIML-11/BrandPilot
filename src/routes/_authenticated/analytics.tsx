import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { Loader2, Eye, MousePointerClick, Heart, Send, Sparkles } from "lucide-react";
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
  const { data, isLoading } = useQuery({
    queryKey: ["analytics"],
    queryFn: async () => {
      const from = format(subDays(new Date(), 29), "yyyy-MM-dd");
      const { data: rows, error } = await supabase
        .from("content_items")
        .select("scheduled_date, type, status, platforms, impressions, clicks, engagements")
        .gte("scheduled_date", from)
        .order("scheduled_date");
      if (error) throw error;
      return rows ?? [];
    },
  });

  const { data: strategies } = useQuery({
    queryKey: ["strategies"],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("content_strategies")
        .select("id, week_start, week_end, insights, directives, rebuilt_dates")
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

  const byType = ["blog", "infographic", "video"].map((type) => ({
    type,
    pieces: rows.filter((r) => r.type === type).length,
    impressions: rows
      .filter((r) => r.type === type)
      .reduce((s, r) => s + (r.impressions ?? 0), 0),
  }));

  const platformCounts: Record<string, number> = {};
  rows.forEach((r) => (r.platforms ?? []).forEach((p) => (platformCounts[p] = (platformCounts[p] ?? 0) + 1)));
  const byPlatform = Object.entries(platformCounts).map(([name, value]) => ({ name, value }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Performance for the last 30 days of scheduled content.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Eye} label="Impressions" value={totals.impressions.toLocaleString()} />
        <Stat icon={MousePointerClick} label="Clicks" value={totals.clicks.toLocaleString()} />
        <Stat icon={Heart} label="Engagements" value={totals.engagements.toLocaleString()} />
        <Stat icon={Send} label="Posted pieces" value={totals.posted} />
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
            <h2 className="text-sm font-semibold">Mix by channel</h2>
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
            <h2 className="text-sm font-semibold">Volume by content type</h2>
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byType}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="type" stroke="var(--color-muted-foreground)" fontSize={11} />
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
