/**
 * Automatic generation schedule (PRODUCTION ONLY). Server-only.
 *
 * Rules:
 *  - Runs from the 01:00 IST cron. Does nothing unless VERCEL_ENV === "production".
 *  - First generation: the subscription day if bought before 01:00 IST, else the next day.
 *  - Exactly 4 generations in every 30-day window: day 0, 7, 14, 21 of the window. Days 22-29
 *    never generate, so a 5th generation can never happen inside 30 days.
 *  - One generation = 7 days of content (2,1,2,2,1,2,1 types per day); each day publishes at 7 AM on its own date.
 *  - Each generation first reads the last 14 days of measured results (learnForBrand).
 *  - Idempotent: auto_generation_log has a unique (brand_id, run_date).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadBrand } from "@/lib/brand.server";
import { getGenerationEntitlement } from "@/lib/generation-entitlements";
import { weeklyContentPlan, renderingRowsForDay, activePlatforms, CONTENT_TYPES } from "@/lib/content.server";
import { learnForBrand } from "@/lib/strategy-queue.server";

type Admin = SupabaseClient<any, any, any>;

/** Carousels stay off while we are watching AI image cost. Set true to include them. */
const INCLUDE_CAROUSEL = false;
const CYCLE_DAYS = 30;
const GENERATION_OFFSETS = [0, 7, 14, 21];
const IST_MS = 5.5 * 3600 * 1000;

export function isProduction() {
  return process.env["VERCEL_ENV"] === "production";
}

const istParts = (d: Date) => {
  const t = new Date(d.getTime() + IST_MS);
  return { date: t.toISOString().slice(0, 10), hour: t.getUTCHours() };
};

const dayNumber = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);

/** First generation day for a subscription bought at `startedAt`. */
export function firstGenerationDate(startedAt: Date): string {
  const { date, hour } = istParts(startedAt);
  return hour < 1 ? date : new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

/** Which generation (0-3) of the 30-day cycle falls on `today`, or null if none. */
export function generationSlot(firstDate: string, today: string): { slot: number; cycle: number } | null {
  const d = dayNumber(today) - dayNumber(firstDate);
  if (d < 0) return null;
  const slot = GENERATION_OFFSETS.indexOf(d % CYCLE_DAYS);
  return slot < 0 ? null : { slot, cycle: Math.floor(d / CYCLE_DAYS) };
}

async function subscriptionStart(admin: Admin, userId: string): Promise<Date | null> {
  const { data: sub } = await admin
    .from("subscriptions")
    .select("created_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (sub?.created_at) return new Date(sub.created_at);
  return null;
}

export async function runAutoGeneration(admin: Admin, now = new Date()) {
  if (!isProduction()) return { skipped: "not production" };

  const today = istParts(now).date;
  const month = today.slice(0, 7);

  // Candidate users: everyone with an active subscription, plus the owner account.
  const { data: subs } = await admin.from("subscriptions").select("user_id").eq("status", "active");
  const userIds = new Set<string>((subs ?? []).map((r: { user_id: string }) => r.user_id));
  const { ROOT_EMAIL } = await import("@/lib/generation-entitlements");
  const { data: root } = await admin.from("profiles").select("id, created_at").eq("email", ROOT_EMAIL).maybeSingle();
  if (root?.id) userIds.add(root.id);

  const result = { checked: 0, queued: 0, learned: 0, skipped: 0, errors: 0 };

  for (const userId of userIds) {
    try {
      let start = await subscriptionStart(admin, userId);
      if (!start && root?.id === userId && root.created_at) start = new Date(root.created_at);
      if (!start) continue;
      const due = generationSlot(firstGenerationDate(start), today);
      if (!due) continue;

      const entitlement = await getGenerationEntitlement(admin, userId);
      const { data: brands } = await admin.from("brand_profiles").select("id").eq("user_id", userId);

      for (const b of brands ?? []) {
        result.checked += 1;
        try {
          const brand = await loadBrand(admin, userId, b.id);
          if (!brand || !brand.business_name) { result.skipped += 1; continue; }

          // Hard cap: never more than 4 generations in any rolling 30 days, never twice in 6 days.
          const since = new Date(now.getTime() - 29 * 86_400_000).toISOString().slice(0, 10);
          const { data: recent } = await admin
            .from("auto_generation_log")
            .select("run_date")
            .eq("brand_id", b.id)
            .gte("run_date", since);
          const dates = (recent ?? []).map((r: { run_date: string }) => r.run_date);
          if (dates.length >= 4 || dates.some((d: string) => Math.abs(dayNumber(today) - dayNumber(d)) < 6)) {
            result.skipped += 1;
            continue;
          }

          // Reserve this run first. If another invocation already did, the insert fails.
          const { error: logError } = await admin.from("auto_generation_log").insert({
            user_id: userId, brand_id: b.id, run_date: today, cycle_index: due.cycle * 4 + due.slot,
          });
          if (logError) { result.skipped += 1; continue; }

          // Learn from the previous cycle's measured results before generating.
          try {
            const l = await learnForBrand(admin, userId, b.id, today);
            if (l.learned) result.learned += 1;
          } catch (e) {
            console.error("[auto-generate] learning failed", e);
          }

          const { data: active } = await admin
            .from("content_generation_jobs")
            .select("id")
            .eq("brand_id", b.id)
            .in("status", ["pending", "running"])
            .limit(1)
            .maybeSingle();
          if (active) { result.skipped += 1; continue; }

          // One generation = 7 days from today; the 11 types are spread across them.
          const weekDates = Array.from({ length: 7 }, (_, i) =>
            new Date((dayNumber(today) + i) * 86_400_000).toISOString().slice(0, 10),
          );
          const contentPlan = weeklyContentPlan(weekDates);
          for (const d of weekDates) {
            const q = contentPlan[d];
            if (q && !INCLUDE_CAROUSEL) q.carousel = 0;
          }
          const activeDates = weekDates.filter((d) => {
            const q = contentPlan[d];
            return !!q && CONTENT_TYPES.some((t) => q[t] > 0);
          });
          if (!activeDates.length) continue;

          // Skip if content for these days already exists.
          const { count } = await admin
            .from("content_items")
            .select("id", { count: "exact", head: true })
            .eq("brand_id", b.id)
            .in("scheduled_date", activeDates);
          if (count) { result.skipped += 1; continue; }

          await admin.from("content_generation_jobs").delete().eq("brand_id", b.id).eq("month", month);
          const { data: job, error: jobError } = await admin
            .from("content_generation_jobs")
            .insert({
              user_id: userId, brand_id: b.id, month, pending_dates: activeDates,
              days_total: activeDates.length, days_done: 0, status: "pending",
              content_plan: contentPlan, error: null,
            })
            .select("id")
            .single();
          if (jobError || !job) throw new Error(jobError?.message ?? "job insert failed");

          const platforms = activePlatforms(brand as never).slice(0, entitlement.plan.channelLimit ?? undefined);
          const rows = activeDates.flatMap((d) =>
            renderingRowsForDay(
              { userId, brandId: b.id, date: d, platforms, autopost: entitlement.plan.autoPost },
              contentPlan[d]!,
            ),
          );
          const { error: rowError } = await admin.from("content_items").insert(rows as never);
          if (rowError) {
            await admin.from("content_generation_jobs").delete().eq("id", job.id);
            throw new Error(rowError.message);
          }
          result.queued += 1;
        } catch (e) {
          result.errors += 1;
          console.error("[auto-generate] brand failed", e);
        }
      }
    } catch (e) {
      result.errors += 1;
      console.error("[auto-generate] user failed", e);
    }
  }
  return result;
}
