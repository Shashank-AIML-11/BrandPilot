import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/components/app-shell";
import { agencyPlanFor, resolveActiveBrand, useAgencyBrands, useStoredBrandId } from "@/lib/agency";

/**
 * Analytics: real numbers only. Everything here comes from post_metric_snapshots, which the
 * background job fills from each platform's API after LOVIZA publishes a post (see
 * channels/metrics.server.ts). Nothing is estimated or made up. A platform that refuses to
 * return numbers is stored with ok = false and is left out, never shown as zero.
 */

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({ meta: [{ title: "Analytics — LOVIZA" }] }),
  component: Analytics,
});

interface Row {
  logId: string;
  channel: string;
  type: string;
  title: string;
  date: string; // YYYY-MM-DD the post was scheduled / published
  impressions: number;
  clicks: number;
  engagements: number;
}

const RANGES = [
  { days: 7, label: "Last 7 days" },
  { days: 30, label: "Last 30 days" },
  { days: 90, label: "Last 90 days" },
  { days: 365, label: "Last 12 months" },
];

const nice = (v: string) => v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const fmt = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(Math.round(n));
const pct = (num: number, den: number) => (den > 0 ? `${((num / den) * 100).toFixed(1)}%` : "–");

// The generated database types may not list newer tables, so these two reads are loosely typed.
type Loose = { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as Loose;

function useMeasuredPosts(brandId: string | null) {
  return useQuery({
    queryKey: ["analytics-posts", brandId ?? "all"],
    queryFn: async (): Promise<Row[]> => {
      const { data: snaps, error } = await db
        .from("post_metric_snapshots")
        .select("publish_log_id, content_item_id, channel, impressions, clicks, engagements, fetched_at")
        .eq("ok", true)
        .order("fetched_at", { ascending: false })
        .limit(5000);
      if (error) throw error;
      // Newest snapshot per published post.
      const latest = new Map<string, any>(); // eslint-disable-line @typescript-eslint/no-explicit-any
      for (const s of snaps ?? []) if (!latest.has(s.publish_log_id)) latest.set(s.publish_log_id, s);
      const ids = [...new Set([...latest.values()].map((s) => s.content_item_id as string))];
      const items = new Map<string, { type: string; title: string; scheduled_date: string; brand_id: string | null }>();
      for (let i = 0; i < ids.length; i += 150) {
        const { data, error: e2 } = await db
          .from("content_items")
          .select("id, type, title, scheduled_date, brand_id")
          .in("id", ids.slice(i, i + 150));
        if (e2) throw e2;
        for (const it of data ?? []) items.set(it.id, it);
      }
      const rows: Row[] = [];
      for (const s of latest.values()) {
        const it = items.get(s.content_item_id);
        if (!it) continue;
        if (brandId && it.brand_id !== brandId) continue;
        rows.push({
          logId: s.publish_log_id,
          channel: s.channel,
          type: it.type,
          title: it.title || "Untitled",
          date: String(it.scheduled_date).slice(0, 10),
          impressions: s.impressions ?? 0,
          clicks: s.clicks ?? 0,
          engagements: s.engagements ?? 0,
        });
      }
      return rows;
    },
  });
}

function sum(rows: Row[]) {
  return rows.reduce(
    (a, r) => ({ posts: a.posts + 1, impressions: a.impressions + r.impressions, clicks: a.clicks + r.clicks, engagements: a.engagements + r.engagements }),
    { posts: 0, impressions: 0, clicks: 0, engagements: 0 },
  );
}

function group(rows: Row[], key: (r: Row) => string) {
  const map = new Map<string, Row[]>();
  for (const r of rows) map.set(key(r), [...(map.get(key(r)) ?? []), r]);
  return [...map.entries()]
    .map(([name, list]) => ({ name, ...sum(list) }))
    .sort((a, b) => b.impressions - a.impressions);
}

function Analytics() {
  const { data: me } = useMe();
  const isAgency = !!agencyPlanFor(me);
  const { data: brands } = useAgencyBrands(isAgency);
  const storedId = useStoredBrandId();
  const activeBrand = resolveActiveBrand(brands, storedId);
  const brandId = isAgency ? (activeBrand?.id ?? null) : null;

  const { data: all = [], isLoading, error } = useMeasuredPosts(brandId);
  const [days, setDays] = useState(30);
  const [channel, setChannel] = useState("all");
  const [type, setType] = useState("all");

  const rows = useMemo(() => {
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    return all.filter(
      (r) => r.date >= cutoff && (channel === "all" || r.channel === channel) && (type === "all" || r.type === type),
    );
  }, [all, days, channel, type]);

  const channels = [...new Set(all.map((r) => r.channel))].sort();
  const types = [...new Set(all.map((r) => r.type))].sort();
  const total = sum(rows);
  const byChannel = group(rows, (r) => r.channel);
  const byType = group(rows, (r) => r.type);
  const daily = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.date, (m.get(r.date) ?? 0) + r.impressions);
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [rows]);
  const maxDay = Math.max(1, ...daily.map(([, v]) => v));
  const top = [...rows].sort((a, b) => b.engagements - a.engagements).slice(0, 10);

  const select = "h-9 rounded-md border border-input bg-background px-3 text-sm";

  return (
    <div className="w-full space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Real results from posts LOVIZA published to your connected channels. Numbers are pulled from each platform
          about 24 hours after posting and refreshed daily for a week. LOVIZA learns from the same numbers.
        </p>
      </div>

      <div className="surface flex flex-wrap items-end gap-4 p-4">
        <label className="space-y-1 text-xs uppercase tracking-wide text-muted-foreground">
          Date range
          <select className={`${select} block`} value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {RANGES.map((r) => <option key={r.days} value={r.days}>{r.label}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs uppercase tracking-wide text-muted-foreground">
          Platform
          <select className={`${select} block`} value={channel} onChange={(e) => setChannel(e.target.value)}>
            <option value="all">All platforms</option>
            {channels.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs uppercase tracking-wide text-muted-foreground">
          Content type
          <select className={`${select} block`} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="all">All content types</option>
            {types.map((t) => <option key={t} value={t}>{nice(t)}</option>)}
          </select>
        </label>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading your results…</p>
      ) : error ? (
        <p className="text-sm text-destructive">Could not load analytics. Try refreshing the page.</p>
      ) : rows.length === 0 ? (
        <div className="surface space-y-2 p-8 text-center">
          <h2 className="text-lg font-semibold">No measured posts yet</h2>
          <p className="mx-auto max-w-xl text-sm text-muted-foreground">
            Results appear here after a post has been published through a connected channel and the platform has
            returned its numbers (about 24 hours later). Posts you publish by hand, and platforms that do not share
            numbers, are not counted. Nothing on this page is estimated.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {[
              ["Posts measured", String(total.posts)],
              ["Impressions", fmt(total.impressions)],
              ["Engagements", fmt(total.engagements)],
              ["Engagement rate", pct(total.engagements, total.impressions)],
              ["Link clicks", fmt(total.clicks)],
            ].map(([label, value]) => (
              <div key={label} className="surface p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
                <p className="mt-1 text-2xl font-bold">{value}</p>
              </div>
            ))}
          </div>

          <section className="surface space-y-3 p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Impressions by post date</h2>
            <div className="flex h-40 items-end gap-1">
              {daily.map(([d, v]) => (
                <div key={d} className="group relative flex h-full flex-1 items-end" title={`${d}: ${fmt(v)} impressions`}>
                  <div className="w-full rounded-t bg-primary/80" style={{ height: `${Math.max(3, (v / maxDay) * 100)}%` }} />
                </div>
              ))}
            </div>
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>{daily[0]?.[0]}</span>
              <span>{daily[daily.length - 1]?.[0]}</span>
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            {[
              { title: "By platform", list: byChannel, label: (n: string) => n },
              { title: "By content type", list: byType, label: nice },
            ].map((t) => (
              <section key={t.title} className="surface space-y-3 p-6">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t.title}</h2>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="py-1 font-medium">Name</th>
                      <th className="py-1 text-right font-medium">Posts</th>
                      <th className="py-1 text-right font-medium">Impressions</th>
                      <th className="py-1 text-right font-medium">Eng. rate</th>
                      <th className="py-1 text-right font-medium">Clicks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {t.list.map((g) => (
                      <tr key={g.name} className="border-t border-border">
                        <td className="py-2 font-medium">{t.label(g.name)}</td>
                        <td className="py-2 text-right">{g.posts}</td>
                        <td className="py-2 text-right">{fmt(g.impressions)}</td>
                        <td className="py-2 text-right">{pct(g.engagements, g.impressions)}</td>
                        <td className="py-2 text-right">{fmt(g.clicks)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ))}
          </div>

          <section className="surface space-y-3 p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Top posts</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-1 font-medium">Post</th>
                  <th className="py-1 font-medium">Platform</th>
                  <th className="py-1 text-right font-medium">Impressions</th>
                  <th className="py-1 text-right font-medium">Engagements</th>
                  <th className="py-1 text-right font-medium">Eng. rate</th>
                </tr>
              </thead>
              <tbody>
                {top.map((r) => (
                  <tr key={r.logId} className="border-t border-border">
                    <td className="max-w-[24rem] truncate py-2" title={r.title}>{r.title}</td>
                    <td className="py-2">{r.channel}</td>
                    <td className="py-2 text-right">{fmt(r.impressions)}</td>
                    <td className="py-2 text-right">{fmt(r.engagements)}</td>
                    <td className="py-2 text-right">{pct(r.engagements, r.impressions)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}
