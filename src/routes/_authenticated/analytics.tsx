import { useMemo, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/components/app-shell";
import { BusinessGrowth } from "@/components/business-growth";
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
  pillar: string;
  hook: string;
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
      const items = new Map<string, { type: string; title: string; scheduled_date: string; brand_id: string | null; style_meta: { pillar?: string; hook?: string } | null }>();
      for (let i = 0; i < ids.length; i += 150) {
        const { data, error: e2 } = await db
          .from("content_items")
          .select("id, type, title, scheduled_date, brand_id, style_meta")
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
          pillar: it.style_meta?.pillar ?? "",
          hook: it.style_meta?.hook ?? "",
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

const pctOf = (cur: number, prev: number) =>
  prev > 0 ? { up: cur >= prev, text: `${cur >= prev ? "↑" : "↓"} ${Math.abs(((cur - prev) / prev) * 100).toFixed(1)}% vs previous period` } : null;

function Delta({ cur, prev }: { cur: number; prev: number }) {
  const d = pctOf(cur, prev);
  return d ? (
    <p className={`mt-1 text-xs font-semibold ${d.up ? "text-emerald-500" : "text-red-400"}`}>{d.text}</p>
  ) : (
    <p className="mt-1 text-xs text-muted-foreground">No earlier period to compare</p>
  );
}

function Kpi({ label, value, hint, children }: { label: string; value: string; hint: string; children?: ReactNode }) {
  return (
    <div className="surface p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-bold">{value}</p>
      {children}
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function NotTracked({ label, why }: { label: string; why: string }) {
  return (
    <div className="surface border-dashed p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-lg font-semibold text-muted-foreground">Not tracked yet</p>
      <p className="mt-1 text-xs text-muted-foreground">{why}</p>
    </div>
  );
}

function TrendChart({ points }: { points: Array<{ d: string; imp: number; eng: number }> }) {
  const W = 640, H = 200, P = 28;
  const max = Math.max(1, ...points.map((p) => p.imp));
  const x = (i: number) => (points.length === 1 ? W / 2 : P + (i * (W - P * 2)) / (points.length - 1));
  const y = (v: number) => H - P - (v / max) * (H - P * 2);
  const line = (key: "imp" | "eng") => points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(" ");
  const area = `${line("eng")} L${x(points.length - 1).toFixed(1)},${H - P} L${x(0).toFixed(1)},${H - P} Z`;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-56 w-full" role="img" aria-label="Impressions and engagements by post date">
        {[0, 0.5, 1].map((g) => (
          <g key={g}>
            <line x1={P} x2={W - P} y1={y(max * g)} y2={y(max * g)} className="stroke-border" strokeWidth="1" />
            <text x={2} y={y(max * g) + 4} className="fill-muted-foreground" fontSize="10">{fmt(max * g)}</text>
          </g>
        ))}
        <path d={area} className="fill-amber-500/15" />
        <path d={line("imp")} fill="none" className="stroke-foreground" strokeWidth="2" />
        <path d={line("eng")} fill="none" className="stroke-amber-500" strokeWidth="2" />
        {points.length < 40 && points.map((p, i) => (
          <circle key={p.d} cx={x(i)} cy={y(p.imp)} r="2.5" className="fill-foreground"><title>{`${p.d}: ${fmt(p.imp)} impressions, ${fmt(p.eng)} engagements`}</title></circle>
        ))}
      </svg>
      <div className="flex justify-between text-[11px] text-muted-foreground">
        <span>{points[0]?.d}</span>
        <span>{points[points.length - 1]?.d}</span>
      </div>
      <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><i className="inline-block h-0.5 w-4 bg-foreground" /> Impressions</span>
        <span className="flex items-center gap-1.5"><i className="inline-block h-0.5 w-4 bg-amber-500" /> Engagements</span>
      </div>
    </div>
  );
}

const DONUT = ["text-primary", "text-amber-500", "text-indigo-400", "text-slate-500"];

function Donut({ parts, total }: { parts: Array<{ name: string; value: number }>; total: number }) {
  const R = 52, C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="flex flex-wrap items-center justify-center gap-6">
      <div className="relative h-40 w-40">
        <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
          {parts.map((p, i) => {
            const len = total > 0 ? (p.value / total) * C : 0;
            const el = (
              <circle key={p.name} cx="70" cy="70" r={R} fill="none" strokeWidth="18" stroke="currentColor"
                className={DONUT[i % DONUT.length]} strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset} />
            );
            offset += len;
            return el;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold">{fmt(total)}</span>
          <span className="text-[11px] text-muted-foreground">Engagements</span>
        </div>
      </div>
      <ul className="space-y-1.5 text-sm">
        {parts.map((p, i) => (
          <li key={p.name} className="flex items-center gap-2">
            <span className={`inline-block h-2.5 w-2.5 rounded-sm bg-current ${DONUT[i % DONUT.length]}`} />
            {p.name} <b>{pct(p.value, total)}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Chips({ items, hot = 2 }: { items: string[]; hot?: number }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((t, i) => (
        <span key={t} className={`rounded-md px-2.5 py-1 text-xs ${i < hot ? "bg-amber-500/20 text-amber-400" : "bg-muted text-muted-foreground"}`}>{t}</span>
      ))}
    </div>
  );
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
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"platform" | "type">("platform");

  const { rows, prev } = useMemo(() => {
    const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
    const cutoff = iso(Date.now() - days * 86_400_000);
    const prevCut = iso(Date.now() - days * 2 * 86_400_000);
    const term = q.trim().toLowerCase();
    const ok = (r: Row) =>
      (channel === "all" || r.channel === channel) &&
      (type === "all" || r.type === type) &&
      (!term || `${r.title} ${r.pillar} ${r.hook}`.toLowerCase().includes(term));
    return {
      rows: all.filter((r) => r.date >= cutoff && ok(r)),
      prev: all.filter((r) => r.date >= prevCut && r.date < cutoff && ok(r)),
    };
  }, [all, days, channel, type, q]);

  const channels = [...new Set(all.map((r) => r.channel))].sort();
  const types = [...new Set(all.map((r) => r.type))].sort();
  const total = sum(rows);
  const before = sum(prev);
  const overallRate = total.impressions > 0 ? total.engagements / total.impressions : 0;
  const byChannel = group(rows, (r) => r.channel);
  const byType = group(rows, (r) => r.type);

  const trend = useMemo(() => {
    const m = new Map<string, { imp: number; eng: number }>();
    for (const r of rows) {
      const c = m.get(r.date) ?? { imp: 0, eng: 0 };
      m.set(r.date, { imp: c.imp + r.impressions, eng: c.eng + r.engagements });
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([d, v]) => ({ d, ...v }));
  }, [rows]);

  const mix = useMemo(() => {
    const byEng = [...byChannel].sort((a, b) => b.engagements - a.engagements);
    const head = byEng.slice(0, 3).map((g) => ({ name: g.name, value: g.engagements }));
    const rest = byEng.slice(3).reduce((a, g) => a + g.engagements, 0);
    return rest > 0 ? [...head, { name: "Other", value: rest }] : head;
  }, [byChannel]);

  // Which topics (content pillars) and hooks earn the best engagement rate, from real results.
  const rank = (key: (r: Row) => string) =>
    group(rows.filter((r) => key(r)), key)
      .filter((g) => g.impressions > 0)
      .sort((a, b) => b.engagements / b.impressions - a.engagements / a.impressions);
  const topics = rank((r) => r.pillar);
  const hooks = rank((r) => r.hook);
  const topChannel = [...byChannel].filter((g) => g.impressions > 0).sort((a, b) => b.engagements / b.impressions - a.engagements / a.impressions)[0];
  const lowCtr = [...byChannel].filter((g) => g.impressions >= 100 && g.clicks / g.impressions < 0.005)[0];

  const status = (g: { posts: number; impressions: number; engagements: number }) => {
    if (g.posts < 3) return { text: "Early", cls: "bg-muted text-muted-foreground" };
    const rate = g.impressions > 0 ? g.engagements / g.impressions : 0;
    if (overallRate > 0 && rate >= overallRate * 1.25) return { text: "Strong", cls: "bg-emerald-500/20 text-emerald-400" };
    if (overallRate > 0 && rate <= overallRate * 0.75) return { text: "Improve", cls: "bg-amber-500/20 text-amber-400" };
    return { text: "Stable", cls: "bg-muted text-muted-foreground" };
  };
  const topPlatformFor = (t: string) => group(rows.filter((r) => r.type === t), (r) => r.channel)[0]?.name ?? "–";

  const select = "h-9 rounded-md border border-input bg-background px-3 text-sm";
  const th = "py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground";
  const empty = rows.length === 0;

  return (
    <div className="w-full space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Content Intelligence</h1>
      </div>

      {me?.isAdmin && <BusinessGrowth />}

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
        <label className="min-w-[14rem] flex-1 space-y-1 text-xs uppercase tracking-wide text-muted-foreground">
          Search content
          <input className={`${select} block w-full`} placeholder="Title, topic, keyword..." value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading your results…</p>
      ) : error ? (
        <p className="text-sm text-destructive">Could not load analytics. Try refreshing the page.</p>
      ) : (
        <>
          {empty && (
            <div className="surface space-y-1 p-5">
              <h2 className="font-semibold">No measured posts in this view yet</h2>
              <p className="text-sm text-muted-foreground">
                Charts fill in after a post goes out through a connected channel and the platform returns its numbers
                (about 24 hours later). Posts published by hand and platforms that share no numbers are not counted.
                Nothing here is estimated or sample data.
              </p>
            </div>
          )}

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Performance at a glance</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <Kpi label="Impressions" value={fmt(total.impressions)} hint="Total content exposures">
                <Delta cur={total.impressions} prev={before.impressions} />
              </Kpi>
              <NotTracked label="Reach" why="Platforms report unique reach differently; not collected yet." />
              <Kpi label="Engagements" value={fmt(total.engagements)} hint="Likes, comments, shares, saves">
                <Delta cur={total.engagements} prev={before.engagements} />
              </Kpi>
              <Kpi label="Engagement rate" value={pct(total.engagements, total.impressions)} hint="Engagements ÷ impressions">
                <Delta cur={overallRate} prev={before.impressions > 0 ? before.engagements / before.impressions : 0} />
              </Kpi>
              <Kpi label="Link clicks" value={fmt(total.clicks)} hint="Outbound + website clicks">
                <Delta cur={total.clicks} prev={before.clicks} />
              </Kpi>
              <NotTracked label="Conversions" why="Needs Google Analytics or a CRM connected." />
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <section className="surface space-y-3 p-6">
              <div>
                <h2 className="font-semibold">Performance trend</h2>
                <p className="text-xs text-muted-foreground">Daily activity by post date across the selected period</p>
              </div>
              {trend.length ? <TrendChart points={trend} /> : <p className="py-16 text-center text-sm text-muted-foreground">No data in this period yet.</p>}
            </section>
            <section className="surface space-y-3 p-6">
              <div>
                <h2 className="font-semibold">Engagement mix by platform</h2>
                <p className="text-xs text-muted-foreground">Share of total engagements</p>
              </div>
              {total.engagements > 0 ? <Donut parts={mix} total={total.engagements} /> : <p className="py-16 text-center text-sm text-muted-foreground">No data in this period yet.</p>}
            </section>
          </div>

          <section className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Channel & content performance</h2>
                <p className="text-sm text-muted-foreground">Compare distribution efficiency and identify repeatable winners.</p>
              </div>
              <div className="flex gap-1 border-b border-border text-sm">
                {([["platform", "By platform"], ["type", "By content type"]] as const).map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setTab(k)}
                    className={`px-3 py-2 ${tab === k ? "border-b-2 border-amber-500 font-semibold" : "text-muted-foreground"}`}>{l}</button>
                ))}
              </div>
            </div>
            <div className="surface overflow-x-auto p-4">
              {tab === "platform" ? (
                <table className="w-full text-sm">
                  <thead><tr><th className={th}>Platform</th><th className={th}>Posts</th><th className={th}>Impressions</th><th className={th}>Engagement rate</th><th className={th}>Clicks</th><th className={th}>Status</th></tr></thead>
                  <tbody>
                    {byChannel.map((g) => { const st = status(g); return (
                      <tr key={g.name} className="border-t border-border">
                        <td className="py-3 font-semibold">{g.name}</td><td>{g.posts}</td><td>{fmt(g.impressions)}</td>
                        <td>{pct(g.engagements, g.impressions)}</td><td>{fmt(g.clicks)}</td>
                        <td><span className={`rounded-full px-2.5 py-0.5 text-xs ${st.cls}`}>{st.text}</span></td>
                      </tr>); })}
                  </tbody>
                </table>
              ) : (
                <table className="w-full text-sm">
                  <thead><tr><th className={th}>Content type</th><th className={th}>Published</th><th className={th}>Impressions</th><th className={th}>Avg. engagement</th><th className={th}>CTR</th><th className={th}>Top platform</th></tr></thead>
                  <tbody>
                    {byType.map((g) => (
                      <tr key={g.name} className="border-t border-border">
                        <td className="py-3 font-semibold">{nice(g.name)}</td><td>{g.posts}</td><td>{fmt(g.impressions)}</td>
                        <td>{pct(g.engagements, g.impressions)}</td><td>{pct(g.clicks, g.impressions)}</td><td>{topPlatformFor(g.name)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {empty && <p className="py-6 text-center text-sm text-muted-foreground">No data in this period yet.</p>}
            </div>
          </section>

          <section className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold">Audience & intent intelligence</h2>
              <p className="text-sm text-muted-foreground">Who is responding and whether they fit the target customer.</p>
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              {[
                ["Audience by age group", "Needs each platform's audience-insights permission (LinkedIn, Meta, YouTube)."],
                ["Top audience regions", "Needs each platform's audience-insights permission."],
                ["B2B audience profile", "Needs LinkedIn page analytics access."],
              ].map(([t, why]) => (
                <div key={t} className="surface border-dashed p-5">
                  <h3 className="font-semibold">{t}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">Not tracked yet.</p>
                  <p className="mt-1 text-xs text-muted-foreground">{why}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold">Content intelligence signals</h2>
              <p className="text-sm text-muted-foreground">Reusable creative direction taken from your own results, best engagement rate first.</p>
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="surface space-y-3 p-5">
                <h3 className="font-semibold">Topics attracting interest</h3>
                {topics.length ? <Chips items={topics.slice(0, 8).map((g) => g.name)} /> : <p className="text-sm text-muted-foreground">Appears once posts planned by the Brand Brain have been measured.</p>}
              </div>
              <div className="surface space-y-3 p-5">
                <h3 className="font-semibold">Creative patterns that work</h3>
                {hooks.length ? <Chips items={hooks.slice(0, 8).map((g) => g.name)} /> : <p className="text-sm text-muted-foreground">Appears once posts planned by the Brand Brain have been measured.</p>}
              </div>
              <div className="surface border-dashed p-5">
                <h3 className="font-semibold">Audience intent signals</h3>
                <p className="mt-2 text-sm text-muted-foreground">Not tracked yet.</p>
                <p className="mt-1 text-xs text-muted-foreground">Needs comment and message analysis, which LOVIZA does not do yet.</p>
              </div>
            </div>
          </section>

          <section className="surface space-y-3 p-6">
            <h2 className="font-semibold">What LOVIZA should learn from this period</h2>
            {total.posts < 5 ? (
              <p className="text-sm text-muted-foreground">
                Recommendations appear once at least 5 posts have been measured in this view ({total.posts} so far). Until then
                there is not enough real data to say anything reliable.
              </p>
            ) : (
              <ol className="list-decimal space-y-2 pl-5 text-sm">
                {topics[0] && <li><b>Increase:</b> more posts about “{topics[0].name}”{hooks[0] ? ` using the “${hooks[0].name}” hook` : ""}. They have the best engagement rate ({pct(topics[0].engagements, topics[0].impressions)}).</li>}
                {topChannel && <li><b>Adapt:</b> {topChannel.name} is your best platform ({pct(topChannel.engagements, topChannel.impressions)} engagement). Reuse its winning posts on other platforms.</li>}
                {lowCtr && <li><b>Improve:</b> {lowCtr.name} posts get views but few link clicks ({pct(lowCtr.clicks, lowCtr.impressions)}). Add a clear call to action and a link.</li>}
              </ol>
            )}
            <p className="text-xs text-muted-foreground">Based on {total.posts} measured post{total.posts === 1 ? "" : "s"}. Rules applied to your own numbers, not estimates.</p>
          </section>
        </>
      )}
    </div>
  );
}
