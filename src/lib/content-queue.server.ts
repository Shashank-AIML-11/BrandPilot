import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { chatJSON } from "@/lib/ai.server";
import {
  SYSTEM_PROMPT,
  activePlatforms,
  rowsForDay,
  weekPrompt,
  emptyQuota,
  buildWeekResponseSchema,
  packGenerationBatch,
  type DailyContentQuota,
} from "@/lib/content.server";
import { getGenerationEntitlement } from "@/lib/generation-entitlements";
import { loadBrand } from "@/lib/brand.server";

type AdminClient = SupabaseClient<Database>;

const DAYS_PER_CYCLE = 7;

/**
 * Generates one chunk of days for a queued month job.
 *
 * IMPORTANT:
 * - If userId is supplied, ONLY that user's job is processed.
 * - Only one batch is processed per call.
 * - This makes it safe for the browser to call this repeatedly.
 * - The job is re-checked after AI generation so that
 *   "Refresh Calendar" can safely cancel an in-flight job.
 */
export async function processGenerationQueue(admin: AdminClient, userId?: string) {
  let query = admin
    .from("content_generation_jobs")
    .select("*")
    .in("status", ["pending", "running"])
    .order("created_at", { ascending: true })
    .limit(1);

  if (userId) {
    query = query.eq("user_id", userId);
  }

  const { data: job, error: jobError } = await query.maybeSingle();
  if (jobError) throw new Error(jobError.message);
  if (!job) return { job: null as string | null, generated: 0 };

  const pending = (job.pending_dates ?? []).slice(0, DAYS_PER_CYCLE);

  if (!pending.length) {
    await admin
      .from("content_generation_jobs")
      .update({ status: "completed", pending_dates: [] })
      .eq("id", job.id);
    return { job: job.id, generated: 0 };
  }

  await admin.from("content_generation_jobs").update({ status: "running" }).eq("id", job.id);

  try {
    // The job belongs to one brand (a Scale-plan user can own several).
    const brand = await loadBrand(admin, job.user_id, job.brand_id);

    if (!brand || !brand.business_name) {
      throw new Error("Complete your Brand Profile before generating content.");
    }

    const entitlement = await getGenerationEntitlement(admin, job.user_id);
    const platforms = activePlatforms(brand as never).slice(
      0,
      entitlement.plan.channelLimit ?? undefined,
    );

    // content_plan is the REMAINING quota per date. Each pass writes what fits in one AI call
    // and subtracts it, so a day with many content types is finished over a few passes instead
    // of asking for everything at once (which overflows the model's output limit).
    const contentPlan = (job.content_plan ?? {}) as unknown as Record<string, DailyContentQuota>;
    const remainingQuotas = Object.fromEntries(
      pending.map((date) => [date, contentPlan[date] ?? emptyQuota()]),
    ) as Record<string, DailyContentQuota>;

    const batch = packGenerationBatch(pending, remainingQuotas);
    const batchDates = batch.dates;
    const quotas = batch.quotas;
    const batchActiveTypes = batch.types;

    const { latestStrategy } = await import("@/lib/strategy-queue.server");
    const strategy = await latestStrategy(admin, job.user_id, brand.id);

    // Nothing left to write for these days (all quotas already used or zero): just close them.
    if (!batchDates.length) {
      const rest = (job.pending_dates ?? []).slice(pending.length);
      await admin
        .from("content_generation_jobs")
        .update({
          pending_dates: rest,
          days_done: job.days_done + pending.length,
          status: rest.length ? "running" : "completed",
          error: null,
        })
        .eq("id", job.id);
      return { job: job.id, generated: 0 };
    }

    // The model occasionally leaves out an (empty) type key and the strict schema check
    // rejects the reply. That is random, so retry a couple of times before giving up.
    let result: { days?: Array<Record<string, unknown>> } = {};
    for (let attempt = 1; ; attempt += 1) {
      try {
        result = await chatJSON<{ days?: Array<Record<string, unknown>> }>(
          SYSTEM_PROMPT,
          weekPrompt(brand as never, batchDates, strategy, quotas, batchActiveTypes),
          buildWeekResponseSchema(batchActiveTypes),
        );
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (attempt >= 3 || !message.includes("json_validate_failed")) throw error;
        console.warn(`[generate] schema miss, retrying (${attempt}/3)`);
      }
    }

    const days = (result.days ?? []) as Array<{ date?: string }>;

    /*
     * IMPORTANT: the user may have clicked "Refresh Calendar" while the AI
     * was generating. Refresh deletes the generation job — re-check it
     * before inserting anything.
     */
    const { data: currentJob, error: currentJobError } = await admin
      .from("content_generation_jobs")
      .select("id, status")
      .eq("id", job.id)
      .eq("user_id", job.user_id)
      .maybeSingle();

    if (currentJobError) throw new Error(currentJobError.message);
    if (!currentJob || !["pending", "running"].includes(currentJob.status)) {
      return { job: job.id, generated: 0, cancelled: true };
    }

    const rows = batchDates.flatMap((date, index) => {
      const day = days.find((d) => (d as { date?: string }).date === date) ?? days[index] ?? {};
      return rowsForDay(
        day as never,
        {
          userId: job.user_id,
          brandId: brand.id,
          date,
          platforms,
          autopost: entitlement.plan.autoPost,
        },
        quotas[date]!,
      );
    });

    if (!rows.length) {
      throw new Error("The generator returned no content for this batch.");
    }

    /*
     * ============================================================
     * FIND THE PLACEHOLDER "RENDERING" ROWS
     * ============================================================
     * queueMonthGeneration() created these rows before AI generation
     * started, so the calendar shows something instantly.
     */
    const { data: renderingItems, error: renderingReadError } = await admin
      .from("content_items")
      .select("id, scheduled_date, type, scheduled_time")
      .eq("user_id", job.user_id)
      .eq("brand_id", brand.id)
      .in("scheduled_date", batchDates)
      .eq("status", "draft")
      .order("scheduled_date", { ascending: true })
      .order("scheduled_time", { ascending: true });

    if (renderingReadError) throw new Error(renderingReadError.message);

    /*
     * ============================================================
     * GROUP PLACEHOLDER ROWS BY DATE + TYPE
     * ============================================================
     */
    const placeholderMap = new Map<
      string,
      Array<{ id: string; scheduled_date: string; type: string; scheduled_time: string }>
    >();

    for (const item of renderingItems ?? []) {
      const key = `${item.scheduled_date}:${item.type}`;
      const list = placeholderMap.get(key) ?? [];
      list.push(item);
      placeholderMap.set(key, list);
    }
    // Only this pass's share of each slot; the rest stay "rendering" for the next pass.
    for (const [key, list] of placeholderMap) {
      const [date, type] = key.split(":") as [string, keyof DailyContentQuota];
      placeholderMap.set(key, list.slice(0, quotas[date]?.[type] ?? 0));
    }

    /*
     * ============================================================
     * UPDATE EXISTING RENDERING ROWS
     * ============================================================
     */
    const generatedRows = rows as Array<Record<string, unknown>>;
    const updatedIds = new Set<string>();

    for (const row of generatedRows) {
      const date = String(row.scheduled_date);
      const type = String(row.type);
      const key = `${date}:${type}`;
      const candidates = placeholderMap.get(key) ?? [];
      const placeholder = candidates.shift();

      if (!placeholder) {
        // Safety fallback: if the AI returned more content than the
        // placeholder count, create a new row instead of dropping it.
        const { status: _ignoredStatus, ...insertRow } = row;
        const { error: fallbackInsertError } = await admin
          .from("content_items")
          .insert({ ...insertRow, status: "scheduled" } as never);
        if (fallbackInsertError) throw new Error(fallbackInsertError.message);
        continue;
      }

      // Update the existing Rendering row.
      // draft = Rendering, scheduled = Ready — this is the key transition.
      const { error: updateError } = await admin
        .from("content_items")
        .update({ ...row, status: "scheduled" } as never)
        .eq("id", placeholder.id)
        .eq("user_id", job.user_id);

      if (updateError) throw new Error(updateError.message);
      updatedIds.add(placeholder.id);
    }

    /*
     * ============================================================
     * HANDLE ANY PLACEHOLDERS THE AI FAILED TO FILL
     * ============================================================
     */
    for (const [, remainingPlaceholders] of placeholderMap) {
      for (const placeholder of remainingPlaceholders) {
        if (updatedIds.has(placeholder.id)) continue;
        await admin
          .from("content_items")
          .update({
            status: "failed",
            title: "Content generation failed",
            summary: "The AI generator did not return content for this slot.",
          })
          .eq("id", placeholder.id)
          .eq("user_id", job.user_id);
      }
    }

    // Subtract what this pass wrote; a date is finished once its remaining quota is empty.
    const newPlan: Record<string, DailyContentQuota> = { ...contentPlan };
    for (const date of batchDates) {
      const left = { ...(contentPlan[date] ?? emptyQuota()) } as DailyContentQuota;
      for (const type of Object.keys(left) as Array<keyof DailyContentQuota>) {
        left[type] = Math.max(0, (left[type] ?? 0) - (quotas[date]?.[type] ?? 0));
      }
      newPlan[date] = left;
    }
    const hasQuotaLeft = (date: string) =>
      Object.values(newPlan[date] ?? {}).some((n) => (n ?? 0) > 0);
    const stillOpen = pending.filter(hasQuotaLeft);
    const finished = pending.length - stillOpen.length;
    const remaining = [...stillOpen, ...(job.pending_dates ?? []).slice(pending.length)];

    await admin
      .from("content_generation_jobs")
      .update({
        pending_dates: remaining,
        days_done: job.days_done + finished,
        content_plan: newPlan as never,
        status: remaining.length ? "running" : "completed",
        error: null,
      })
      .eq("id", job.id);

    return { job: job.id, generated: finished };
  } catch (error) {
    console.error("Generation queue error:", error);
    const message = error instanceof Error ? error.message : "Content generation failed.";
    await admin
      .from("content_generation_jobs")
      .update({ status: "running", error: message })
      .eq("id", job.id);
    return { job: job.id, generated: 0, error: message };
  }
}
