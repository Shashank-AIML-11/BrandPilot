/**
 * Pulls real performance numbers for posts LOVIZA has already published, stores them as
 * snapshots (24h / 3d / 7d / 14d after posting) and rolls the latest numbers up onto
 * content_items, which is what the weekly strategy loop learns from. Server-only.
 *
 * Design rules:
 *  - One failing post/channel never stops the run.
 *  - A platform that REFUSES to return numbers (missing scope, deleted post) is recorded
 *    as ok=false so we stop retrying, and is never counted as "zero performance".
 *  - Temporary failures (429 / 5xx / network) are skipped and retried on the next run.
 *  - Impressions, clicks and engagements are normalised across platforms; the untouched
 *    platform payload is kept in `raw` for later analysis.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { liveConnection, type LiveConnection } from "./oauth.server";

type Admin = SupabaseClient<never, never, never>;

export interface Measured {
  impressions: number;
  clicks: number;
  engagements: number;
  raw: Record<string, unknown>;
}

/** Thrown for "will never work for this post" (denied / deleted). Anything else is retried. */
class PermanentMetricsError extends Error {}

const LINKEDIN_VERSION = process.env["LINKEDIN_VERSION"] || "202606";
const GRAPH = "https://graph.facebook.com/v21.0";

const BUCKETS = [
  { name: "d14", minHours: 14 * 24 },
  { name: "d7", minHours: 7 * 24 },
  { name: "h72", minHours: 72 },
  { name: "h24", minHours: 24 },
] as const;
type BucketName = (typeof BUCKETS)[number]["name"];
const BUCKET_ORDER: BucketName[] = ["h24", "h72", "d7", "d14"];

/** Looks back this far for posts that still deserve a new snapshot. */
const LOOKBACK_DAYS = 15;
/** Upper bound of platform calls per run, so one cron tick stays well inside its time limit. */
const MAX_FETCHES_PER_RUN = 60;

const num = (v: unknown): number => {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};

async function getJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  const res = await fetch(url, { headers });
  const text = await res.text();
  if (!res.ok) {
    const message = `HTTP ${res.status}: ${text.slice(0, 300)}`;
    if ([400, 401, 403, 404, 410].includes(res.status)) throw new PermanentMetricsError(message);
    throw new Error(message);
  }
  return text ? JSON.parse(text) : {};
}

/* -------------------------------- LinkedIn -------------------------------- */
/**
 * Uses the member post-analytics API. Needs the r_member_postAnalytics permission on the
 * LinkedIn app, which LinkedIn grants only after review. Until then every call returns
 * 403, which is recorded as "not measurable" rather than as a flop.
 */
async function measureLinkedIn(conn: LiveConnection, externalId: string): Promise<Measured> {
  const urn = externalId.startsWith("urn:") ? externalId : `urn:li:share:${externalId}`;
  const kind = urn.includes(":ugcPost:") ? "ugc" : "share";
  const entity = `(${kind}:${encodeURIComponent(urn)})`;
  const headers = {
    authorization: `Bearer ${conn.accessToken}`,
    "LinkedIn-Version": LINKEDIN_VERSION,
    "X-Restli-Protocol-Version": "2.0.0",
  };

  const count = async (queryType: string): Promise<number> => {
    const json = (await getJson(
      `https://api.linkedin.com/rest/memberCreatorPostAnalytics?q=entity&entity=${entity}&queryType=${queryType}&aggregation=TOTAL`,
      headers,
    )) as { elements?: Array<{ count?: number }> };
    return num(json.elements?.[0]?.count);
  };

  // IMPRESSION is the gate: if it fails the whole post is unmeasurable.
  const impressions = await count("IMPRESSION");
  const extras: Record<string, number> = {};
  for (const q of ["REACTION", "COMMENT", "RESHARE", "MEMBERS_REACHED"]) {
    try {
      extras[q] = await count(q);
    } catch {
      extras[q] = 0;
    }
  }
  return {
    impressions,
    clicks: 0, // LinkedIn does not expose click counts for member posts.
    engagements: extras["REACTION"]! + extras["COMMENT"]! + extras["RESHARE"]!,
    raw: { impressions, ...extras },
  };
}

/* -------------------------------- Facebook -------------------------------- */

async function firstMetric(
  base: string,
  token: string,
  metrics: string[],
): Promise<{ metric: string; value: number } | null> {
  // One request per metric: Meta rejects the WHOLE call if a single metric name is
  // retired or unsupported for that post type, and these names change often.
  for (const metric of metrics) {
    try {
      const json = (await getJson(
        `${base}/insights?metric=${metric}&access_token=${encodeURIComponent(token)}`,
      )) as {
        data?: Array<{ values?: Array<{ value?: unknown }>; total_value?: { value?: unknown } }>;
      };
      const row = json.data?.[0];
      const value = row?.total_value?.value ?? row?.values?.[0]?.value;
      if (typeof value === "number" || typeof value === "string") return { metric, value: num(value) };
    } catch {
      /* try the next candidate metric name */
    }
  }
  return null;
}

async function measureFacebook(conn: LiveConnection, externalId: string): Promise<Measured> {
  const base = `${GRAPH}/${externalId}`;
  const social = (await getJson(
    `${base}?fields=reactions.summary(true).limit(0),comments.summary(true).limit(0),shares&access_token=${encodeURIComponent(conn.accessToken)}`,
  )) as {
    reactions?: { summary?: { total_count?: number } };
    comments?: { summary?: { total_count?: number } };
    shares?: { count?: number };
  };
  const reactions = num(social.reactions?.summary?.total_count);
  const comments = num(social.comments?.summary?.total_count);
  const shares = num(social.shares?.count);

  const views = await firstMetric(base, conn.accessToken, [
    "post_media_view",
    "post_total_media_view_unique",
    "post_impressions",
  ]);
  const clicks = await firstMetric(base, conn.accessToken, ["post_clicks"]);

  return {
    impressions: views?.value ?? 0,
    clicks: clicks?.value ?? 0,
    engagements: reactions + comments + shares,
    raw: { reactions, comments, shares, views, clicks },
  };
}

/* -------------------------------- Instagram ------------------------------- */

async function measureInstagram(conn: LiveConnection, externalId: string): Promise<Measured> {
  const base = `${GRAPH}/${externalId}`;
  const values: Record<string, number> = {};
  let anySuccess = false;
  let lastError: unknown = null;

  for (const metric of ["views", "reach", "likes", "comments", "shares", "saved", "total_interactions"]) {
    try {
      const json = (await getJson(
        `${base}/insights?metric=${metric}&access_token=${encodeURIComponent(conn.accessToken)}`,
      )) as {
        data?: Array<{ values?: Array<{ value?: unknown }>; total_value?: { value?: unknown } }>;
      };
      const row = json.data?.[0];
      values[metric] = num(row?.total_value?.value ?? row?.values?.[0]?.value);
      anySuccess = true;
    } catch (error) {
      lastError = error; // some metrics are not offered for every media type
    }
  }

  if (!anySuccess) {
    // Fall back to the public counters before giving up.
    const basic = (await getJson(
      `${base}?fields=like_count,comments_count&access_token=${encodeURIComponent(conn.accessToken)}`,
    ).catch(() => {
      throw lastError instanceof Error ? lastError : new Error("Instagram insights unavailable");
    })) as { like_count?: number; comments_count?: number };
    const engagements = num(basic.like_count) + num(basic.comments_count);
    return { impressions: 0, clicks: 0, engagements, raw: { ...basic, fallback: true } };
  }

  const engagements =
    values["total_interactions"] ||
    (values["likes"] ?? 0) + (values["comments"] ?? 0) + (values["shares"] ?? 0) + (values["saved"] ?? 0);
  return {
    impressions: values["views"] || values["reach"] || 0,
    clicks: 0,
    engagements,
    raw: values,
  };
}

/* ------------------------------------ X ----------------------------------- */

async function measureX(conn: LiveConnection, externalId: string): Promise<Measured> {
  const json = (await getJson(
    `https://api.x.com/2/tweets/${externalId}?tweet.fields=public_metrics`,
    { authorization: `Bearer ${conn.accessToken}` },
  )) as {
    data?: {
      public_metrics?: {
        impression_count?: number;
        like_count?: number;
        reply_count?: number;
        retweet_count?: number;
        quote_count?: number;
        bookmark_count?: number;
        url_link_clicks?: number;
      };
    };
  };
  const m = json.data?.public_metrics;
  if (!m) throw new PermanentMetricsError("X returned no metrics for this post");
  return {
    impressions: num(m.impression_count),
    clicks: num(m.url_link_clicks),
    engagements:
      num(m.like_count) + num(m.reply_count) + num(m.retweet_count) + num(m.quote_count) + num(m.bookmark_count),
    raw: m as Record<string, unknown>,
  };
}

/* ----------------------------------- YouTube ------------------------------ */

async function measureYouTube(conn: LiveConnection, externalId: string): Promise<Measured> {
  const json = (await getJson(
    `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${encodeURIComponent(externalId)}`,
    { authorization: `Bearer ${conn.accessToken}` },
  )) as {
    items?: Array<{ statistics?: { viewCount?: string; likeCount?: string; commentCount?: string } }>;
  };
  const s = json.items?.[0]?.statistics;
  if (!s) throw new PermanentMetricsError("YouTube video not found");
  return {
    impressions: num(s.viewCount),
    clicks: 0,
    engagements: num(s.likeCount) + num(s.commentCount),
    raw: s as Record<string, unknown>,
  };
}

/* --------------------------------- Pinterest ------------------------------- */

async function measurePinterest(conn: LiveConnection, externalId: string): Promise<Measured> {
  const end = new Date();
  const start = new Date(end.getTime() - 85 * 24 * 3600 * 1000); // API caps the range at 90 days
  const d = (x: Date) => x.toISOString().slice(0, 10);
  const json = (await getJson(
    `https://api.pinterest.com/v5/pins/${externalId}/analytics?start_date=${d(start)}&end_date=${d(end)}&metric_types=IMPRESSION,PIN_CLICK,OUTBOUND_CLICK,SAVE`,
    { authorization: `Bearer ${conn.accessToken}` },
  )) as { all?: { summary_metrics?: Record<string, number> } };
  const s = json.all?.summary_metrics ?? {};
  return {
    impressions: num(s["IMPRESSION"]),
    clicks: num(s["OUTBOUND_CLICK"]) || num(s["PIN_CLICK"]),
    engagements: num(s["SAVE"]) + num(s["PIN_CLICK"]),
    raw: s,
  };
}

const MEASURERS: Record<string, (conn: LiveConnection, externalId: string) => Promise<Measured>> = {
  LinkedIn: measureLinkedIn,
  Facebook: measureFacebook,
  Instagram: measureInstagram,
  X: measureX,
  YouTube: measureYouTube,
  Pinterest: measurePinterest,
  // TikTok is intentionally absent: publishing returns a publish_id, not a video id,
  // and unaudited apps only create private drafts, so there is nothing public to measure.
};

/* ------------------------------ Orchestration ------------------------------ */

interface LogRow {
  id: string;
  user_id: string;
  content_item_id: string;
  channel: string;
  external_id: string;
  created_at: string;
}

function bucketFor(createdAt: string, now: number): BucketName | null {
  const hours = (now - Date.parse(createdAt)) / 3_600_000;
  return BUCKETS.find((b) => hours >= b.minHours)?.name ?? null;
}

/** Sum of the newest OK snapshot of every channel the item was published to. */
async function rollUpItem(admin: Admin, itemId: string) {
  const { data } = await admin
    .from("post_metric_snapshots")
    .select("publish_log_id, bucket, ok, impressions, clicks, engagements")
    .eq("content_item_id", itemId);
  const rows = ((data ?? []) as unknown as Array<{
    publish_log_id: string;
    bucket: BucketName;
    ok: boolean;
    impressions: number;
    clicks: number;
    engagements: number;
  }>).filter((r) => r.ok);
  if (!rows.length) return;

  const newest = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    const cur = newest.get(r.publish_log_id);
    if (!cur || BUCKET_ORDER.indexOf(r.bucket) > BUCKET_ORDER.indexOf(cur.bucket)) {
      newest.set(r.publish_log_id, r);
    }
  }
  const totals = { impressions: 0, clicks: 0, engagements: 0 };
  for (const r of newest.values()) {
    totals.impressions += r.impressions;
    totals.clicks += r.clicks;
    totals.engagements += r.engagements;
  }
  await admin
    .from("content_items")
    .update({ ...totals, metrics_updated_at: new Date().toISOString() } as never)
    .eq("id", itemId);
}

export async function syncPostMetrics(admin: Admin) {
  const now = Date.now();
  const since = new Date(now - LOOKBACK_DAYS * 24 * 3600 * 1000).toISOString();

  const { data } = await admin
    .from("publish_log")
    .select("id, user_id, content_item_id, channel, external_id, created_at")
    .eq("status", "posted")
    .neq("external_id", "")
    .in("channel", Object.keys(MEASURERS))
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(500);
  const logs = ((data ?? []) as unknown as LogRow[]).filter((l) => l.content_item_id);
  if (!logs.length) return { checked: 0, captured: 0, unmeasurable: 0, failed: 0 };

  const { data: snaps } = await admin
    .from("post_metric_snapshots")
    .select("publish_log_id, bucket")
    .in(
      "publish_log_id",
      logs.map((l) => l.id),
    );
  const have = new Set(
    ((snaps ?? []) as unknown as Array<{ publish_log_id: string; bucket: string }>).map(
      (s) => `${s.publish_log_id}:${s.bucket}`,
    ),
  );

  const due = logs
    .map((log) => ({ log, bucket: bucketFor(log.created_at, now) }))
    .filter((x): x is { log: LogRow; bucket: BucketName } => !!x.bucket && !have.has(`${x.log.id}:${x.bucket}`))
    .slice(0, MAX_FETCHES_PER_RUN);

  const conns = new Map<string, LiveConnection | null>();
  const touched = new Set<string>();
  let captured = 0;
  let unmeasurable = 0;
  let failed = 0;

  for (const { log, bucket } of due) {
    const key = `${log.user_id}:${log.channel}`;
    if (!conns.has(key)) conns.set(key, await liveConnection(admin, log.user_id, log.channel));
    const conn = conns.get(key);
    if (!conn?.accessToken) {
      failed += 1; // channel disconnected since posting; try again if they reconnect
      continue;
    }

    const base = {
      user_id: log.user_id,
      content_item_id: log.content_item_id,
      publish_log_id: log.id,
      channel: log.channel,
      external_id: log.external_id,
      bucket,
    };

    try {
      const m = await MEASURERS[log.channel]!(conn, log.external_id);
      await admin
        .from("post_metric_snapshots")
        .upsert(
          { ...base, ok: true, impressions: m.impressions, clicks: m.clicks, engagements: m.engagements, raw: m.raw } as never,
          { onConflict: "publish_log_id,bucket" },
        );
      touched.add(log.content_item_id);
      captured += 1;
    } catch (error) {
      if (error instanceof PermanentMetricsError) {
        await admin
          .from("post_metric_snapshots")
          .upsert({ ...base, ok: false, raw: { error: error.message } } as never, {
            onConflict: "publish_log_id,bucket",
          });
        unmeasurable += 1;
      } else {
        console.error(`metrics fetch failed (${log.channel})`, error);
        failed += 1;
      }
    }
  }

  for (const itemId of touched) {
    try {
      await rollUpItem(admin, itemId);
    } catch (error) {
      console.error("metrics roll-up failed", error);
    }
  }

  return { checked: due.length, captured, unmeasurable, failed };
}
