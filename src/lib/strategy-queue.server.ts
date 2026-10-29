import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { chatJSON } from "@/lib/ai.server";
import { brandContext, SAFETY_RULES, type StrategyDirective } from "@/lib/content.server";

type AdminClient = SupabaseClient<Database>;

const USERS_PER_CYCLE = 3;

const STRATEGY_SYSTEM = `You are a senior performance-marketing strategist reviewing one brand's own weekly content analytics.
You only reason from the numbers and the brand profile you are given. Never invent data.
Be specific and operational: name the formats, hooks, channels, posting times and topics to double down on, and the ones to drop.
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
  scheduled_date: string;
  scheduled_time: string | null;
  type: string;
  title: string | null;
  caption: string | null;
  body: string | null;
  status: string | null;
  platforms: string[] | null;
  impressions: number | null;
  clicks: number | null;
  engagements: number | null;
}

/** First line a reader sees: the thing the model should learn to repeat or avoid. */
function hookOf(r: Row) {
  const text = (r.caption || r.body || r.title || "").trim().split(/\n+/)[0] ?? "";
  return text.slice(0, 140);
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
    // Rates make groups comparable even when one format simply got posted more often.
    return Object.fromEntries(
      Object.entries(map).map(([k, v]) => [
        k,
        {
          ...v,
          engagement_rate: v.impressions ? +(v.engagements / v.impressions).toFixed(4) : null,
          ctr: v.impressions ? +(v.clicks / v.impressions).toFixed(4) : null,
        },
      ]),
    );
  };

  const ranked = [...rows].sort((a, b) => score(b) - score(a));
  const brief = (r: Row) => ({
    title: r.title ?? "",
    hook: hookOf(r),
    type: r.type,
    channels: r.platforms ?? [],
    time: r.scheduled_time,
    engagement_rate: r.impressions ? +((r.engagements ?? 0) / r.impressions).toFixed(4) : null,
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

  // Learn from a 14-day window so a post is judged on its 3-7 day numbers, not only its first
  // hours, and ONLY from posts a platform actually returned numbers for (metrics_updated_at set).
  // A post we could not measure is unknown, never a failure.
  const loose = admin as unknown as SupabaseClient;
  const dataStart = addDays(weekEnd, -13);
  const { data: rowsData, error } = await loose
    .from("content_items")
    .select(
      "user_id, scheduled_date, scheduled_time, type, title, caption, body, status, platforms, impressions, clicks, engagements",
    )
    .eq("status", "posted")
    .not("metrics_updated_at", "is", null)
    .gte("scheduled_date", iso(dataStart))
    .lte("scheduled_date", iso(weekEnd));
  if (error) throw new Error(error.message);

  const rows = (rowsData ?? []) as Row[];
  if (!rows.length) return { reviewed: 0 };

  const byUser: Record<string, Row[]> = {};
  rows.forEach((r) => {
    (byUser[r.user_id] ??= []).push(r);
  });

  const { data: existing } = await admin
    .from("content_strategies")
    .select("user_id")
    .eq("week_start", iso(weekStart));
  const done = new Set((existing ?? []).map((r) => r.user_id));

  const candidates = Object.entries(byUser)
    .filter(([userId, list]) => !done.has(userId) && list.some((r) => score(r) > 0))
    .slice(0, USERS_PER_CYCLE);

  let reviewed = 0;

  for (const [userId, list] of candidates) {
    try {
      const { data: brand } = await admin
        .from("brand_profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      if (!brand || !brand.business_name) continue;

      const metrics = summarise(list);
      const previous = await latestStrategy(admin, userId);
      const analysis = await chatJSON<{ insights?: string; directives?: string }>(
        STRATEGY_SYSTEM,
        `${brandContext(brand as never)}

Here is the measured performance of this brand's posted content for ${iso(dataStart)} to ${iso(weekEnd)} (JSON). Only posts with real platform numbers are included; engagement_rate = engagements / impressions:
${JSON.stringify(metrics)}
${
  previous?.directives
    ? `
Last cycle you instructed the generator (${previous.week_start} to ${previous.week_end}):
"${previous.directives}"
Judge whether the posts above show that advice worked. Keep what worked, reverse what did not, and say which it was in "insights".
`
    : ""
}
Small samples are noisy: with fewer than 3 posts in a group, call the pattern tentative instead of firm.
Analyse reach (impressions), user adoption (clicks) and engagement. Then decide how next week's content must change.

Return JSON shaped exactly as:
{
  "insights": "3-5 sentences of concrete findings: which content types, channels, posting times, topics and hook styles won or lost, with the numbers that prove it.",
  "directives": "A single operational brief (max 200 words) written as instructions to the content generator: the exact formats to increase, formats to cut, channels to prioritise, best posting time windows, hook and topic angles to repeat, and what to stop doing."
}`,
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
        .gte("scheduled_date", tomorrow)
        .lte("scheduled_date", monthEnd)
        .neq("status", "posted");
      const rebuildDates = [...new Set((upcoming ?? []).map((r) => r.scheduled_date))].sort();

      await admin.from("content_strategies").insert({
        user_id: userId,
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
          .eq("month", month);
        await admin.from("content_generation_jobs").insert({
          user_id: userId,
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
): Promise<StrategyDirective | null> {
  const { data } = await admin
    .from("content_strategies")
    .select("week_start, week_end, insights, directives, metrics")
    .eq("user_id", userId)
    .order("week_start", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as StrategyDirective | null) ?? null;
}
