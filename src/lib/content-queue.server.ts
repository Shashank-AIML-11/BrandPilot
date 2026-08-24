import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { chatJSON } from "@/lib/ai.server";
import {
  SYSTEM_PROMPT,
  activePlatforms,
  rowsForDay,
  weekPrompt,
  type DailyContentQuota,
} from "@/lib/content.server";
import { getGenerationEntitlement } from "@/lib/generation-entitlements";

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
export async function processGenerationQueue(
  admin: AdminClient,
  userId?: string,
) {
  let query = admin
    .from("content_generation_jobs")
    .select("*")
    .in("status", ["pending", "running"])
    .order("created_at", { ascending: true })
    .limit(1);

  if (userId) {
    query = query.eq("user_id", userId);
  }

  const {
    data: job,
    error: jobError,
  } = await query.maybeSingle();

  if (jobError) {
    throw new Error(jobError.message);
  }

  if (!job) {
    return {
      job: null as string | null,
      generated: 0,
    };
  }

  const pending = (job.pending_dates ?? []).slice(
    0,
    DAYS_PER_CYCLE,
  );

  if (!pending.length) {
    await admin
      .from("content_generation_jobs")
      .update({
        status: "completed",
        pending_dates: [],
      })
      .eq("id", job.id);

    return {
      job: job.id,
      generated: 0,
    };
  }

  await admin
    .from("content_generation_jobs")
    .update({
      status: "running",
    })
    .eq("id", job.id);

  try {
    const {
      data: brand,
    } = await admin
      .from("brand_profiles")
      .select("*")
      .eq("user_id", job.user_id)
      .maybeSingle();

    if (!brand || !brand.business_name) {
      throw new Error(
        "Complete your Brand Profile before generating content.",
      );
    }

    const entitlement =
      await getGenerationEntitlement(
        admin,
        job.user_id,
      );

    const platforms =
      activePlatforms(
        brand as never,
      ).slice(
        0,
        entitlement.plan.channelLimit ??
          undefined,
      );

    const contentPlan =
      (job.content_plan ?? {}) as unknown as Record<
        string,
        DailyContentQuota
      >;

    const quotas =
      Object.fromEntries(
        pending.map((date) => [
          date,
          contentPlan[date] ?? {
            blog: 0,
            infographic: 0,
            video: 0,
          },
        ]),
      ) as Record<
        string,
        DailyContentQuota
      >;

    const {
      latestStrategy,
    } = await import(
      "@/lib/strategy-queue.server"
    );

    const strategy =
      await latestStrategy(
        admin,
        job.user_id,
      );

    const result =
      await chatJSON<{
        days?: Array<
          Record<string, unknown>
        >;
      }>(
        SYSTEM_PROMPT,
        weekPrompt(
          brand as never,
          pending,
          strategy,
          quotas,
        ),
      );

    /*
     * IMPORTANT:
     *
     * The user may have clicked "Refresh Calendar"
     * while the AI was generating.
     *
     * Refresh deletes the generation job.
     *
     * Re-check it before inserting anything.
     */
    const {
      data: currentJob,
      error: currentJobError,
    } = await admin
      .from("content_generation_jobs")
      .select("id, status")
      .eq("id", job.id)
      .eq("user_id", job.user_id)
      .maybeSingle();

    if (currentJobError) {
      throw new Error(
        currentJobError.message,
      );
    }

    if (
      !currentJob ||
      !["pending", "running"].includes(
        currentJob.status,
      )
    ) {
      return {
        job: job.id,
        generated: 0,
        cancelled: true,
      };
    }

    const days =
      (result.days ?? []) as Array<{
        date?: string;
      }>;

    const rows =
      pending.flatMap(
        (date, index) => {
          const day =
            days.find(
              (d) => d.date === date,
            ) ??
            days[index] ??
            {};

          return rowsForDay(
            day as never,
            {
              userId:
                job.user_id,
              date,
              platforms,
              autopost:
                entitlement.plan
                  .autoPost,
            },
            quotas[date]!,
          );
        },
      );

    if (!rows.length) {
      throw new Error(
        "The generator returned no content for this batch.",
      );
    }

    await admin
      .from("content_items")
      .delete()
      .eq(
        "user_id",
        job.user_id,
      )
      .in(
        "scheduled_date",
        pending,
      );

    const {
      error: insertError,
    } = await admin
      .from("content_items")
      .insert(
        rows as never,
      );

    if (insertError) {
      throw new Error(
        insertError.message,
      );
    }

    const remaining =
      (job.pending_dates ?? []).slice(
        pending.length,
      );

    await admin
      .from("content_generation_jobs")
      .update({
        pending_dates:
          remaining,
        days_done:
          job.days_done +
          pending.length,
        status:
          remaining.length
            ? "running"
            : "completed",
        error: null,
      })
      .eq("id", job.id);

    return {
      job: job.id,
      generated:
        pending.length,
    };
  } catch (error) {
    console.error(
      "Generation queue error:",
      error,
    );

    const message =
      error instanceof Error
        ? error.message
        : "Content generation failed.";

    await admin
      .from("content_generation_jobs")
      .update({
        status: "running",
        error: message,
      })
      .eq("id", job.id);

    return {
      job: job.id,
      generated: 0,
      error: message,
    };
  }
}