import { loadBrand } from "@/lib/brand.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { chatJSON } from "@/lib/ai.server";
import { brandContext, SAFETY_RULES, type StrategyDirective } from "@/lib/content.server";

type AdminClient = SupabaseClient<Database>;

const USERS_PER_CYCLE = 3;

// Strict schema: the model must return exactly these two fields.
const STRATEGY_SCHEMA = {
  type: "object",
  properties: { insights: { type: "string" }, directives: { type: "string" } },
  required: ["insights", "directives"],
  additionalProperties: false,
} as const;

const STRATEGY_SYSTEM = `You are a senior performance-marketing strategist reviewing one brand's own weekly content analytics.
You only reason from the numbers and the brand profile you are given. Never invent data.
Be specific and operational: name the formats, hooks, channels, posting times and topics to double down on, and the ones to drop.
Evidence rules: fewer than 3 pieces of a format is never grounds to cut it, say "too early to judge". Quote rates as percentages, never fractions. Compare formats within the same channel. Never talk about budget or spend. Only mention content types and channels that appear in the data.
Answer with a single valid JSON object and nothing else.

${SAFETY_RULES}`;

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

interface Row {
  user_id: string;
  brand_id: string | null;
  scheduled_date: string;
  scheduled_time: string | null;
  type: string;
  title: string | null;
  status: string | null;
  platforms: string[] | null;
  impressions: number | null;
  clicks: number | null;
  engagements: number | null;
}

function score(r: Row) {
  return (r.impressions ?? 0) + (r.clicks ?? 0) * 5 + (r.engagements ?? 0) * 3;
}

function summarise(rows: Row[]) {
  const totals = rows.reduce(
    (a, r) => ({
      pieces: a.pieces + 1,
      impressions: a.impressions + (r.impressions ?? 0),
      clicks: a.clicks + (r.clicks ?? 0),
      engagements: a.engagements + (r.engagements ?? 0),
    }),
    { pieces: 0, impressions: 0, clicks: 0, engagements: 0 },
  );

  const group = (keyOf: (r: Row) => string[]) => {
    const map: Record<
      string,
      { pieces: number; impressions: number; clicks: number; engagements: number }
    > = {};
    rows.forEach((r) =>
      keyOf(r).forEach((k) => {
        map[k] ??= { pieces: 0, impressions: 0, clicks: 0, engagements: 0 };
        map[k].pieces += 1;
        map[k].impressions += r.impressions ?? 0;
        map[k].clicks += r.clicks ?? 0;
        map[k].engagements += r.engagements ?? 0;
      }),
    );
    return map;
  };

  const ranked = [...rows].sort((a, b) => score(b) - score(a));
  const brief = (r: Row) => ({
    title: r.title ?? "",
    type: r.type,
    time: r.scheduled_time,
    impressions: r.impressions ?? 0,
    clicks: r.clicks ?? 0,
    engagements: r.engagements ?? 0,
  });

  return {
    totals,
    ctr: totals.impressions ? +(totals.clicks / totals.impressions).toFixed(4) : 0,
    engagement_rate: totals.impressions ? +(totals.engagements / totals.impressions).toFixed(4) : 0,
    by_type: group((r) => [r.type]),
    by_platform: group((r) => r.platforms ?? []),
    by_hour: group((r) => [(r.scheduled_time ?? "00:00").slice(0, 2) + ":00"]),
    top_performers: ranked.slice(0, 5).map(brief),
    worst_performers: ranked.slice(-5).reverse().map(brief),
  };
}

/**
 * Weekly learning loop: reads last week's real performance for each brand, asks the
 * model what to change, stores the strategy, and re-queues every upcoming (unposted)
 * day of the current month so the rest of the month is rebuilt against the new plan.
 */
export async function processStrategyQueue(admin: AdminClient) {
  const today = new Date();
  const weekEnd = addDays(today, -1);
  const weekStart = addDays(weekEnd, -6);

  const { data: rowsData, error } = await admin
    .from("content_items")
    .select(
      "user_id, brand_id, scheduled_date, scheduled_time, type, title, status, platforms, impressions, clicks, engagements",
    )
    .gte("scheduled_date", iso(weekStart))
    .lte("scheduled_date", iso(weekEnd));
  if (error) throw new Error(error.message);

  const rows = (rowsData ?? []) as Row[];
  if (!rows.length) return { reviewed: 0 };

  const byUser: Record<string, Row[]> = {};
  rows.forEach((r) => {
    // One review per brand, not per account.
    (byUser[`${r.user_id}|${r.brand_id ?? ""}`] ??= []).push(r);
  });

  const { data: existing } = await admin
    .from("content_strategies")
    .select("user_id, brand_id")
    .eq("week_start", iso(weekStart));
  const done = new Set((existing ?? []).map((r) => `${r.user_id}|${r.brand_id ?? ""}`));

  const candidates = Object.entries(byUser)
    .filter(([key, list]) => !done.has(key) && list.some((r) => score(r) > 0))
    .slice(0, USERS_PER_CYCLE);

  let reviewed = 0;

  for (const [key, list] of candidates) {
    const [userId = "", brandKey = ""] = key.split("|");
    const brandId = brandKey || null;
    try {
      const brand = await loadBrand(admin, userId, brandId);
      if (!brand || !brand.business_name) continue;

      const metrics = summarise(list);
      const analysis = await chatJSON<{ insights?: string; directives?: string }>(
        STRATEGY_SYSTEM,
        `${brandContext(brand as never)}

Here is the measured performance of this brand's content for ${iso(weekStart)} to ${iso(weekEnd)} (JSON):
${JSON.stringify(metrics)}

Analyse reach (impressions), user adoption (clicks) and engagement. Then decide how next week's content must change.

Return JSON shaped exactly as:
{
  "insights": "3-5 sentences of concrete findings: which content types, channels, posting times, topics and hook styles won or lost, with the numbers that prove it.",
  "directives": "A single operational brief (max 200 words) written as instructions to the content generator: the exact formats to increase, formats to cut, channels to prioritise, best posting time windows, hook and topic angles to repeat, and what to stop doing."
}`,
        STRATEGY_SCHEMA as unknown as Record<string, unknown>,
      );

      const insights = (analysis.insights ?? "").trim();
      const directives = (analysis.directives ?? "").trim();
      if (!insights && !directives) continue;

      // Rebuild the rest of the current month against the new strategy.
      const tomorrow = iso(addDays(today, 1));
      const monthEnd = iso(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0)));
      const { data: upcoming } = await admin
        .from("content_items")
        .select("scheduled_date")
        .eq("user_id", userId)
        .filter("brand_id", brandId ? "eq" : "is", brandId)
        .gte("scheduled_date", tomorrow)
        .lte("scheduled_date", monthEnd)
        .neq("status", "posted");
      const rebuildDates = [...new Set((upcoming ?? []).map((r) => r.scheduled_date))].sort();

      await admin.from("content_strategies").insert({
        user_id: userId,
        brand_id: brand.id,
        week_start: iso(weekStart),
        week_end: iso(weekEnd),
        metrics: metrics as never,
        insights,
        directives,
        rebuilt_dates: rebuildDates,
      } as never);

      if (rebuildDates.length) {
        const month = tomorrow.slice(0, 7);
        const { getGenerationEntitlement } = await import("@/lib/generation-entitlements");
        const { distributeMonthlyContent, CONTENT_TYPES } = await import("@/lib/content.server");
        const entitlement = await getGenerationEntitlement(admin, userId);

        /*
         * TESTING MODE: keep this in sync with the same override in
         * content.functions.ts (queueMonthGeneration) — only
         * linkedin_post and instagram_post are enabled right now.
         */
        const ALLOWED_TYPES_FOR_NOW = ["linkedin_post", "instagram_post"] as const;
        const monthlyTotals = { ...entitlement.plan.monthlyContent };
        for (const t of CONTENT_TYPES) {
          if (!(ALLOWED_TYPES_FOR_NOW as readonly string[]).includes(t)) {
            (monthlyTotals as Record<string, number>)[t] = 0;
          }
        }

        await admin
          .from("content_generation_jobs")
          .delete()
          .eq("user_id", userId)
          .eq("brand_id", brand.id)
          .eq("month", month);
        await admin.from("content_generation_jobs").insert({
          user_id: userId,
          brand_id: brand.id,
          month,
          pending_dates: rebuildDates,
          days_total: rebuildDates.length,
          days_done: 0,
          status: "pending",
          content_plan: distributeMonthlyContent(rebuildDates, monthlyTotals),
        } as never);
      }

      reviewed += 1;
    } catch (err) {
      console.error("strategy review failed", err);
    }
  }

  return { reviewed };
}

/** Latest stored strategy for a user, used to steer every new generation. */
export async function latestStrategy(
  admin: AdminClient,
  userId: string,
  brandId?: string | null,
): Promise<StrategyDirective | null> {
  let query = admin
    .from("content_strategies")
    .select("week_start, week_end, insights, directives")
    .eq("user_id", userId);
  if (brandId) query = query.eq("brand_id", brandId);
  const { data } = await query
    .order("week_start", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as StrategyDirective | null) ?? null;
}

/**
 * Learning step that runs right before each automatic generation: reads the measured
 * results of this brand's posts from the last 14 days, writes a new strategy, and the
 * generator picks it up through latestStrategy(). It does not touch any existing content.
 */
export async function learnForBrand(
  admin: AdminClient,
  userId: string,
  brandId: string,
  todayIso: string,
): Promise<{ learned: boolean; reason?: string }> {
  const today = new Date(`${todayIso}T00:00:00Z`);
  const from = iso(addDays(today, -14));
  const to = iso(addDays(today, -1));

  const { data: existing } = await admin
    .from("content_strategies")
    .select("id")
    .eq("brand_id", brandId)
    .eq("week_start", from)
    .limit(1)
    .maybeSingle();
  if (existing) return { learned: false, reason: "already reviewed for this cycle" };

  const { data } = await admin
    .from("content_items")
    .select(
      "user_id, brand_id, scheduled_date, scheduled_time, type, title, caption, body, status, platforms, impressions, clicks, engagements",
    )
    .eq("user_id", userId)
    .eq("brand_id", brandId)
    .eq("status", "posted")
    .gte("scheduled_date", from)
    .lte("scheduled_date", to);
  type R = Row & { caption: string | null; body: string | null };
  const rows = (data ?? []) as unknown as R[];
  if (!rows.length || !rows.some((r) => score(r) > 0)) {
    return { learned: false, reason: "no measured posts yet" };
  }

  const brand = await loadBrand(admin, userId, brandId);
  if (!brand || !brand.business_name) return { learned: false, reason: "brand profile incomplete" };

  const metrics = summarise(rows);
  const ranked = [...rows].sort((a, b) => score(b) - score(a));
  const opening = (r: R) =>
    ({ type: r.type, opening: (r.caption || r.body || r.title || "").split("\n")[0]?.slice(0, 140) ?? "" });
  const hooks = {
    best_openings: ranked.slice(0, 3).map(opening),
    weakest_openings: ranked.slice(-3).reverse().map(opening),
  };

  const { data: previous } = await admin
    .from("content_strategies")
    .select("directives")
    .eq("brand_id", brandId)
    .order("week_start", { ascending: false })
    .limit(1)
    .maybeSingle();

  const analysis = await chatJSON<{ insights?: string; directives?: string }>(
    STRATEGY_SYSTEM,
    `${brandContext(brand as never)}

Measured performance of this brand's posted content from ${from} to ${to} (JSON):
${JSON.stringify({ ...metrics, ...hooks })}
${previous?.directives ? `\nThe previous strategy told the generator: ${previous.directives}\nSay whether it worked and what to change.` : ""}

Analyse reach (impressions), clicks and engagement. Decide how the NEXT 7 days of content must change to grow this brand's reach and virality.

Return JSON shaped exactly as:
{
  "insights": "3-5 sentences of concrete findings with the numbers that prove them.",
  "directives": "A single operational brief (max 200 words) written as instructions to the content generator: formats to increase, formats to cut, channels to prioritise, best posting windows, hook and topic angles to repeat, what to stop doing."
}`,
    STRATEGY_SCHEMA as unknown as Record<string, unknown>,
  );
  const insights = (analysis.insights ?? "").trim();
  const directives = (analysis.directives ?? "").trim();
  if (!insights && !directives) return { learned: false, reason: "model returned nothing" };

  const { error } = await admin.from("content_strategies").insert({
    user_id: userId,
    brand_id: brandId,
    week_start: from,
    week_end: to,
    metrics: metrics as never,
    insights,
    directives,
    rebuilt_dates: [],
  } as never);
  if (error) throw new Error(error.message);
  return { learned: true };
}
