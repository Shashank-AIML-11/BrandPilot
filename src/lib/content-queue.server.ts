// src/lib/content-queue.server.ts

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { chatJSON } from "@/lib/ai.server";
import {
  SYSTEM_PROMPT,
  activePlatforms,
  rowsForDay,
  weekPrompt,
  emptyQuota,
  type DailyContentQuota,
} from "@/lib/content.server";
import { getGenerationEntitlement } from "@/lib/generation-entitlements";

type AdminClient = SupabaseClient<Database>;

const DAYS_PER_CYCLE = 4;

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

  const { data: job, error: jobError } =
    await query.maybeSingle();

  if (jobError) {
    throw new Error(jobError.message);
  }

  if (!job) {
    return {
      job: null,
      generated: 0,
      completed: true,
    };
  }

  const pendingDates = Array.isArray(job.pending_dates)
    ? job.pending_dates
    : [];

  if (!pendingDates.length) {
    await admin
      .from("content_generation_jobs")
      .update({
        status: "completed",
        pending_dates: [],
        error: null,
      })
      .eq("id", job.id);

    return {
      job: job.id,
      generated: 0,
      completed: true,
    };
  }

  const batchDates = pendingDates.slice(
    0,
    DAYS_PER_CYCLE,
  );

  await admin
    .from("content_generation_jobs")
    .update({
      status: "running",
      error: null,
    })
    .eq("id", job.id);

  try {
    const { data: brand, error: brandError } =
      await admin
        .from("brand_profiles")
        .select("*")
        .eq("user_id", job.user_id)
        .maybeSingle();

    if (brandError) {
      throw new Error(brandError.message);
    }

    if (!brand?.business_name) {
      throw new Error(
        "Complete your Brand Profile before generating content.",
      );
    }

    const entitlement =
      await getGenerationEntitlement(
        admin,
        job.user_id,
      );

    const platforms = activePlatforms(
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

    const quotas = Object.fromEntries(
      batchDates.map((date) => [
        date,
        contentPlan[date] ??
          emptyQuota(),
      ]),
    ) as Record<
      string,
      DailyContentQuota
    >;

    const { latestStrategy } =
      await import(
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
          batchDates,
          strategy,
          quotas,
        ),
      );

    /*
     * IMPORTANT:
     * Refresh Calendar may have deleted the job
     * while AI generation was running.
     */
    const {
      data: currentJob,
      error: currentJobError,
    } = await admin
      .from("content_generation_jobs")
      .select(
        "id,status,pending_dates,days_done,days_total",
      )
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
      batchDates.flatMap(
        (date, index) => {
          const day =
            days.find(
              (item) =>
                item.date === date,
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
        "The AI generator returned no content for this batch.",
      );
    }

    /*
     * Find the immediate Rendering placeholders.
     */
    const {
      data: renderingItems,
      error: renderingReadError,
    } = await admin
      .from("content_items")
      .select(
        "id,scheduled_date,type,scheduled_time",
      )
      .eq(
        "user_id",
        job.user_id,
      )
      .in(
        "scheduled_date",
        batchDates,
      )
      .eq(
        "status",
        "draft",
      )
      .order(
        "scheduled_date",
        {
          ascending: true,
        },
      )
      .order(
        "scheduled_time",
        {
          ascending: true,
        },
      );

    if (renderingReadError) {
      throw new Error(
        renderingReadError.message,
      );
    }

    const placeholderMap =
      new Map<
        string,
        Array<{
          id: string;
          scheduled_date: string;
          type: string;
          scheduled_time: string;
        }>
      >();

    for (
      const item of
        renderingItems ?? []
    ) {
      const key =
        `${item.scheduled_date}:${item.type}`;

      const list =
        placeholderMap.get(
          key,
        ) ?? [];

      list.push(item);

      placeholderMap.set(
        key,
        list,
      );
    }

    const generatedRows =
      rows as Array<
        Record<string, unknown>
      >;

    const updatedIds =
      new Set<string>();

    for (
      const row of
        generatedRows
    ) {
      const date =
        String(
          row.scheduled_date,
        );

      const type =
        String(row.type);

      const key =
        `${date}:${type}`;

      const candidates =
        placeholderMap.get(
          key,
        ) ?? [];

      const placeholder =
        candidates.shift();

      if (!placeholder) {
        const {
          status: _ignoredStatus,
          ...insertRow
        } = row;

        const {
          error:
            fallbackInsertError,
        } = await admin
          .from(
            "content_items",
          )
          .insert({
            ...insertRow,
            status:
              "scheduled",
          } as never);

        if (
          fallbackInsertError
        ) {
          throw new Error(
            fallbackInsertError.message,
          );
        }

        continue;
      }

      /*
       * Rendering -> Ready
       */
      const {
        error: updateError,
      } = await admin
        .from(
          "content_items",
        )
        .update({
          ...row,
          status:
            "scheduled",
        } as never)
        .eq(
          "id",
          placeholder.id,
        )
        .eq(
          "user_id",
          job.user_id,
        );

      if (updateError) {
        throw new Error(
          updateError.message,
        );
      }

      updatedIds.add(
        placeholder.id,
      );
    }

    /*
     * Any placeholder not filled by AI becomes Failed.
     * Never leave it stuck in Rendering forever.
     */
    for (
      const remaining
        of placeholderMap.values()
    ) {
      for (
        const placeholder
          of remaining
      ) {
        if (
          updatedIds.has(
            placeholder.id,
          )
        ) {
          continue;
        }

        await admin
          .from(
            "content_items",
          )
          .update({
            status:
              "failed",
            title:
              "Content generation failed",
            summary:
              "The AI generator did not return content for this slot.",
          })
          .eq(
            "id",
            placeholder.id,
          )
          .eq(
            "user_id",
            job.user_id,
          );
      }
    }

    const remaining =
      pendingDates.slice(
        batchDates.length,
      );

    const newDaysDone =
      Number(
        currentJob.days_done ??
          job.days_done ??
          0,
      ) +
      batchDates.length;

    const isCompleted =
      remaining.length === 0;

    const {
      error: jobUpdateError,
    } = await admin
      .from(
        "content_generation_jobs",
      )
      .update({
        pending_dates:
          remaining,
        days_done:
          newDaysDone,
        status:
          isCompleted
            ? "completed"
            : "running",
        error: null,
      })
      .eq(
        "id",
        job.id,
      );

    if (jobUpdateError) {
      throw new Error(
        jobUpdateError.message,
      );
    }

    return {
      job: job.id,
      generated:
        batchDates.length,
      completed:
        isCompleted,
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

    /*
     * CRITICAL FIX:
     * Never leave the job permanently "running".
     */
    await admin
      .from(
        "content_generation_jobs",
      )
      .update({
        status:
          "failed",
        error: message,
      })
      .eq(
        "id",
        job.id,
      )
      .eq(
        "user_id",
        job.user_id,
      );

    /*
     * Also mark remaining Rendering
     * placeholders as failed.
     */
    await admin
      .from("content_items")
      .update({
        status:
          "failed",
        title:
          "Content generation failed",
        summary:
          message,
      })
      .eq(
        "user_id",
        job.user_id,
      )
      .in(
        "scheduled_date",
        batchDates,
      )
      .eq(
        "status",
        "draft",
      );

    return {
      job: job.id,
      generated: 0,
      completed: false,
      error: message,
    };
  }
}