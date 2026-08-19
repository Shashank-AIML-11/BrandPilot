import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const weekInput = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  dates: z
    .array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
    .min(1)
    .max(8),
});

const monthInput = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  dates: z
    .array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
    .min(1)
    .max(31),
});

/**
 * Generate a week of content.
 */
export const generateWeek = createServerFn({
  method: "POST",
})
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    weekInput.parse(input),
  )
  .handler(async ({ data, context }) => {
    const { chatJSON } =
      await import("@/lib/ai.server");

    const helpers =
      await import("@/lib/content.server");

    const {
      getGenerationEntitlement,
    } =
      await import(
        "@/lib/generation-entitlements"
      );

    const entitlement =
      await getGenerationEntitlement(
        context.supabase,
        context.userId,
      );

    const { data: brand } =
      await context.supabase
        .from("brand_profiles")
        .select("*")
        .eq(
          "user_id",
          context.userId,
        )
        .maybeSingle();

    if (
      !brand ||
      !brand.business_name
    ) {
      throw new Error(
        "Complete your Brand Profile before generating content.",
      );
    }

    const platforms =
      helpers
        .activePlatforms(
          brand as never,
        )
        .slice(
          0,
          entitlement.plan
            .channelLimit ??
            undefined,
        );

    const quotaSchedule =
      helpers.distributeMonthlyContent(
        data.dates,
        entitlement.plan
          .monthlyContent,
      );

    const {
      supabaseAdmin,
    } =
      await import(
        "@/integrations/supabase/client.server"
      );

    const {
      latestStrategy,
    } =
      await import(
        "@/lib/strategy-queue.server"
      );

    const strategy =
      await latestStrategy(
        supabaseAdmin,
        context.userId,
      );

    const result =
      await chatJSON<{
        days?: Array<
          Record<string, unknown>
        >;
      }>(
        helpers.SYSTEM_PROMPT,
        helpers.weekPrompt(
          brand as never,
          data.dates,
          strategy,
          quotaSchedule,
        ),
      );

    const days =
      (result.days ?? []) as Array<{
        date?: string;
      }>;

    const rows =
      data.dates.flatMap(
        (date, index) => {
          const day =
            days.find(
              (d) =>
                d.date === date,
            ) ??
            days[index] ??
            {};

          return helpers.rowsForDay(
            day,
            {
              userId:
                context.userId,
              date,
              platforms,
              autopost:
                entitlement.plan
                  .autoPost,
            },
            quotaSchedule[
              date
            ]!,
          );
        },
      );

    if (!rows.length) {
      throw new Error(
        "The generator returned no content. Please try again.",
      );
    }

    await context.supabase
      .from("content_items")
      .delete()
      .eq(
        "user_id",
        context.userId,
      )
      .in(
        "scheduled_date",
        data.dates,
      );

    const { error } =
      await context.supabase
        .from("content_items")
        .insert(
          rows as never,
        );

    if (error) {
      throw new Error(
        error.message,
      );
    }

    return {
      created: rows.length,
    };
  });

/**
 * Generates the visuals for a batch of items
 * in one round-trip.
 */
export const generateMediaBatch =
  createServerFn({
    method: "POST",
  })
    .middleware([
      requireSupabaseAuth,
    ])
    .inputValidator(
      (input: unknown) =>
        z
          .object({
            ids: z
              .array(
                z.string().uuid(),
              )
              .min(1)
              .max(4),
          })
          .parse(input),
    )
    .handler(
      async ({
        data,
        context,
      }) => {
        const {
          generateImageBytes,
        } =
          await import(
            "@/lib/ai.server"
          );

        const {
          imagePromptFor,
        } =
          await import(
            "@/lib/content.server"
          );

        const { data: items } =
          await context.supabase
            .from("content_items")
            .select(
              "id, type, title, summary, image_prompt, image_url",
            )
            .eq(
              "user_id",
              context.userId,
            )
            .in(
              "id",
              data.ids,
            );

        const { data: brand } =
          await context.supabase
            .from("brand_profiles")
            .select(
              "business_name, description, products_services, tone, propositions, icp",
            )
            .eq(
              "user_id",
              context.userId,
            )
            .maybeSingle();

        const results =
          await Promise.allSettled(
            (items ?? [])
              .filter(
                (item) =>
                  !item.image_url,
              )
              .map(
                async (item) => {
                  const bytes =
                    await generateImageBytes(
                      imagePromptFor(
                        item as never,
                        brand as never,
                      ),
                    );

                  const path = `${context.userId}/${item.id}.png`;

                  const {
                    error:
                      uploadError,
                  } =
                    await context.supabase.storage
                      .from(
                        "content-media",
                      )
                      .upload(
                        path,
                        bytes,
                        {
                          contentType:
                            "image/png",
                          upsert:
                            true,
                        },
                      );

                  if (
                    uploadError
                  ) {
                    throw new Error(
                      uploadError.message,
                    );
                  }

                  await context.supabase
                    .from(
                      "content_items",
                    )
                    .update({
                      image_url:
                        path,
                    })
                    .eq(
                      "id",
                      item.id,
                    )
                    .eq(
                      "user_id",
                      context.userId,
                    );
                },
              ),
          );

        return {
          done: results.filter(
            (r) =>
              r.status ===
              "fulfilled",
          ).length,
        };
      },
    );

/**
 * Generate an image for one item.
 */
export const generateItemImage =
  createServerFn({
    method: "POST",
  })
    .middleware([
      requireSupabaseAuth,
    ])
    .inputValidator(
      (input: unknown) =>
        z
          .object({
            id: z.string().uuid(),
          })
          .parse(input),
    )
    .handler(
      async ({
        data,
        context,
      }) => {
        const {
          generateImageBytes,
        } =
          await import(
            "@/lib/ai.server"
          );

        const {
          imagePromptFor,
        } =
          await import(
            "@/lib/content.server"
          );

        const {
          data: item,
          error: readError,
        } =
          await context.supabase
            .from("content_items")
            .select(
              "id, type, title, summary, image_prompt",
            )
            .eq(
              "id",
              data.id,
            )
            .eq(
              "user_id",
              context.userId,
            )
            .single();

        if (
          readError ||
          !item
        ) {
          throw new Error(
            "Content item not found.",
          );
        }

        const {
          data: brand,
        } =
          await context.supabase
            .from("brand_profiles")
            .select(
              "business_name, description, products_services, tone",
            )
            .eq(
              "user_id",
              context.userId,
            )
            .maybeSingle();

        const bytes =
          await generateImageBytes(
            imagePromptFor(
              item as never,
              brand as never,
            ),
          );

        const path = `${context.userId}/${item.id}.png`;

        const {
          error: uploadError,
        } =
          await context.supabase.storage
            .from(
              "content-media",
            )
            .upload(
              path,
              bytes,
              {
                contentType:
                  "image/png",
                upsert: true,
              },
            );

        if (uploadError) {
          throw new Error(
            uploadError.message,
          );
        }

        const {
          error: updateError,
        } =
          await context.supabase
            .from("content_items")
            .update({
              image_url:
                path,
            })
            .eq(
              "id",
              item.id,
            )
            .eq(
              "user_id",
              context.userId,
            );

        if (updateError) {
          throw new Error(
            updateError.message,
          );
        }

        return {
          path,
        };
      },
    );

/**
 * Starts/resumes a video generation job.
 */
export const startItemVideo =
  createServerFn({
    method: "POST",
  })
    .middleware([
      requireSupabaseAuth,
    ])
    .inputValidator(
      (input: unknown) =>
        z
          .object({
            id: z.string().uuid(),
          })
          .parse(input),
    )
    .handler(
      async ({
        data,
        context,
      }) => {
        if (
          process.env[
            "VIDEO_GENERATION_ENABLED"
          ] !== "true"
        ) {
          throw new Error(
            "Video generation is temporarily paused.",
          );
        }

        const {
          createVideoJob,
        } =
          await import(
            "@/lib/ai.server"
          );

        const {
          videoPromptFor,
        } =
          await import(
            "@/lib/content.server"
          );

        const {
          data: item,
          error: readError,
        } =
          await context.supabase
            .from(
              "content_items",
            )
            .select(
              "id, title, summary, video_script, image_prompt, video_url, video_job_id, video_status",
            )
            .eq(
              "id",
              data.id,
            )
            .eq(
              "user_id",
              context.userId,
            )
            .single();

        if (
          readError ||
          !item
        ) {
          throw new Error(
            "Content item not found.",
          );
        }

        if (
          item.video_url
        ) {
          return {
            status:
              "completed" as const,
            jobId:
              item.video_job_id,
          };
        }

        if (
          item.video_status ===
            "generating" &&
          item.video_job_id
        ) {
          return {
            status:
              "generating" as const,
            jobId:
              item.video_job_id,
          };
        }

        const {
          data: brand,
        } =
          await context.supabase
            .from(
              "brand_profiles",
            )
            .select(
              "business_name, description, products_services, icp, tone",
            )
            .eq(
              "user_id",
              context.userId,
            )
            .maybeSingle();

        const job =
          await createVideoJob(
            videoPromptFor(
              item as never,
              brand as never,
            ),
          );

        await context.supabase
          .from(
            "content_items",
          )
          .update({
            video_job_id:
              job.id,
            video_status:
              "generating",
            video_error:
              null,
          })
          .eq(
            "id",
            item.id,
          )
          .eq(
            "user_id",
            context.userId,
          );

        return {
          status:
            "generating" as const,
          jobId: job.id,
        };
      },
    );

/**
 * Polls a video generation job.
 */
export const pollItemVideo =
  createServerFn({
    method: "POST",
  })
    .middleware([
      requireSupabaseAuth,
    ])
    .inputValidator(
      (input: unknown) =>
        z
          .object({
            id: z.string().uuid(),
          })
          .parse(input),
    )
    .handler(
      async ({
        data,
        context,
      }) => {
        if (
          process.env[
            "VIDEO_GENERATION_ENABLED"
          ] !== "true"
        ) {
          return {
            status:
              "paused" as const,
            path: null,
            progress: 0,
          };
        }

        const {
          getVideoJob,
          downloadVideoBytes,
        } =
          await import(
            "@/lib/ai.server"
          );

        const {
          data: item,
          error: readError,
        } =
          await context.supabase
            .from(
              "content_items",
            )
            .select(
              "id, video_url, video_job_id, video_status",
            )
            .eq(
              "id",
              data.id,
            )
            .eq(
              "user_id",
              context.userId,
            )
            .single();

        if (
          readError ||
          !item
        ) {
          throw new Error(
            "Content item not found.",
          );
        }

        if (
          item.video_url
        ) {
          return {
            status:
              "completed" as const,
            path:
              item.video_url,
            progress: 100,
          };
        }

        if (
          !item.video_job_id
        ) {
          return {
            status:
              "none" as const,
            path: null,
            progress: 0,
          };
        }

        const job =
          await getVideoJob(
            item.video_job_id,
          );

        if (
          job.status ===
          "failed"
        ) {
          const message =
            job.error?.message ??
            "Video generation failed.";

          await context.supabase
            .from(
              "content_items",
            )
            .update({
              video_status:
                "failed",
              video_error:
                message,
            })
            .eq(
              "id",
              item.id,
            )
            .eq(
              "user_id",
              context.userId,
            );

          return {
            status:
              "failed" as const,
            path: null,
            progress: 0,
            error: message,
          };
        }

        if (
          job.status !==
          "completed"
        ) {
          return {
            status:
              "generating" as const,
            path: null,
            progress:
              job.progress ??
              0,
          };
        }

        const bytes =
          await downloadVideoBytes(
            item.video_job_id,
          );

        const path = `${context.userId}/${item.id}.mp4`;

        const {
          error: uploadError,
        } =
          await context.supabase.storage
            .from(
              "content-media",
            )
            .upload(
              path,
              bytes,
              {
                contentType:
                  "video/mp4",
                upsert: true,
              },
            );

        if (uploadError) {
          throw new Error(
            uploadError.message,
          );
        }

        const {
          error: updateError,
        } =
          await context.supabase
            .from(
              "content_items",
            )
            .update({
              video_url:
                path,
              video_status:
                "completed",
              video_error:
                null,
            })
            .eq(
              "id",
              item.id,
            )
            .eq(
              "user_id",
              context.userId,
            );

        if (updateError) {
          throw new Error(
            updateError.message,
          );
        }

        return {
          status:
            "completed" as const,
          path,
          progress: 100,
        };
      },
    );

/**
 * Generate a voiceover.
 */
export const generateItemVoiceover =
  createServerFn({
    method: "POST",
  })
    .middleware([
      requireSupabaseAuth,
    ])
    .inputValidator(
      (input: unknown) =>
        z
          .object({
            id: z.string().uuid(),
          })
          .parse(input),
    )
    .handler(
      async ({
        data,
        context,
      }) => {
        const {
          generateSpeechBytes,
        } =
          await import(
            "@/lib/ai.server"
          );

        const {
          narrationFromScript,
        } =
          await import(
            "@/lib/content.server"
          );

        const {
          data: item,
          error: readError,
        } =
          await context.supabase
            .from(
              "content_items",
            )
            .select(
              "id, title, summary, video_script, voiceover_url",
            )
            .eq(
              "id",
              data.id,
            )
            .eq(
              "user_id",
              context.userId,
            )
            .single();

        if (
          readError ||
          !item
        ) {
          throw new Error(
            "Content item not found.",
          );
        }

        if (
          item.voiceover_url
        ) {
          return {
            path:
              item.voiceover_url,
          };
        }

        const narration =
          narrationFromScript(
            item.video_script ??
              "",
            `${item.title}. ${
              item.summary ?? ""
            }`,
          );

        const bytes =
          await generateSpeechBytes(
            narration,
          );

        const path = `${context.userId}/${item.id}-voiceover.mp3`;

        const {
          error: uploadError,
        } =
          await context.supabase.storage
            .from(
              "content-media",
            )
            .upload(
              path,
              bytes,
              {
                contentType:
                  "audio/mpeg",
                upsert: true,
              },
            );

        if (uploadError) {
          throw new Error(
            uploadError.message,
          );
        }

        const {
          error: updateError,
        } =
          await context.supabase
            .from(
              "content_items",
            )
            .update({
              voiceover_url:
                path,
            })
            .eq(
              "id",
              item.id,
            )
            .eq(
              "user_id",
              context.userId,
            );

        if (updateError) {
          throw new Error(
            updateError.message,
          );
        }

        return {
          path,
        };
      },
    );

/**
 * Starts/resumes the durable video worker.
 */
export const processVideoQueueNow =
  createServerFn({
    method: "POST",
  })
    .middleware([
      requireSupabaseAuth,
    ])
    .handler(
      async ({ context }) => {
        const {
          supabaseAdmin,
        } =
          await import(
            "@/integrations/supabase/client.server"
          );

        const {
          processVideoQueue,
        } =
          await import(
            "@/lib/video-queue.server"
          );

        return processVideoQueue(
          supabaseAdmin,
          context.userId,
        );
      },
    );

/**
 * Queue an entire month for durable
 * server-side generation.
 */
export const queueMonthGeneration =
  createServerFn({
    method: "POST",
  })
    .middleware([
      requireSupabaseAuth,
    ])
    .inputValidator(
      (input: unknown) =>
        monthInput.parse(input),
    )
    .handler(
      async ({
        data,
        context,
      }) => {
        const {
          getGenerationEntitlement,
        } =
          await import(
            "@/lib/generation-entitlements"
          );

        const entitlement =
          await getGenerationEntitlement(
            context.supabase,
            context.userId,
          );

        const {
          data: brand,
        } =
          await context.supabase
            .from(
              "brand_profiles",
            )
            .select(
              "business_name",
            )
            .eq(
              "user_id",
              context.userId,
            )
            .maybeSingle();

        if (
          !brand ||
          !brand.business_name
        ) {
          throw new Error(
            "Complete your Brand Profile before generating content.",
          );
        }

        const today =
          new Date()
            .toISOString()
            .slice(0, 10);

        const currentMonth =
          today.slice(0, 7);

        if (
          data.month !==
          currentMonth
        ) {
          throw new Error(
            "Content can only be generated from today through the end of the current month.",
          );
        }

        const monthEnd =
          new Date(
            `${currentMonth}-01T00:00:00.000Z`,
          );

        monthEnd.setUTCMonth(
          monthEnd.getUTCMonth() +
            1,
        );

        monthEnd.setUTCDate(0);

        const lastDate =
          monthEnd
            .toISOString()
            .slice(0, 10);

        const futureDates: string[] =
          [];

        for (
          let date = today;
          date <= lastDate;
        ) {
          futureDates.push(
            date,
          );

          const next =
            new Date(
              `${date}T00:00:00.000Z`,
            );

          next.setUTCDate(
            next.getUTCDate() +
              1,
          );

          date = next
            .toISOString()
            .slice(0, 10);
        }

        /*
         * Do not regenerate days that already
         * contain posted content.
         */
        const {
          data: posted,
        } =
          await context.supabase
            .from(
              "content_items",
            )
            .select(
              "scheduled_date",
            )
            .eq(
              "user_id",
              context.userId,
            )
            .eq(
              "status",
              "posted",
            )
            .in(
              "scheduled_date",
              futureDates.length
                ? futureDates
                : ["1970-01-01"],
            );

        const postedDates =
          new Set(
            (posted ?? []).map(
              (r) =>
                r.scheduled_date as string,
            ),
          );

        const dates =
          futureDates.filter(
            (d) =>
              !postedDates.has(d),
          );

        if (!dates.length) {
          throw new Error(
            "No upcoming days left to generate in this month.",
          );
        }

        const {
          distributeMonthlyContent,
        } =
          await import(
            "@/lib/content.server"
          );

        /*
         * TESTING MODE:
         * Video generation disabled.
         */
        const monthlyTotals = {
          ...entitlement.plan
            .monthlyContent,
          video: 0,
        };

        const contentPlan =
          distributeMonthlyContent(
            dates,
            monthlyTotals,
          );

        const scheduledDates =
          dates.filter(
            (date) => {
              const quota =
                contentPlan[
                  date
                ]!;

              return (
                quota.blog +
                  quota.infographic +
                  quota.video >
                0
              );
            },
          );

        /*
         * Remove any previous generation job
         * for this month.
         */
        await context.supabase
          .from(
            "content_generation_jobs",
          )
          .delete()
          .eq(
            "user_id",
            context.userId,
          )
          .eq(
            "month",
            data.month,
          );

        /*
         * Create new durable generation job.
         */
        const {
          error,
        } =
          await context.supabase
            .from(
              "content_generation_jobs",
            )
            .insert({
              user_id:
                context.userId,
              month:
                data.month,
              pending_dates:
                scheduledDates,
              days_total:
                scheduledDates.length,
              days_done: 0,
              status:
                "pending",
              content_plan:
                contentPlan,
            } as never);

        if (error) {
          throw new Error(
            error.message,
          );
        }

        /*
         * Drain the queue immediately.
         */
        const {
          supabaseAdmin,
        } =
          await import(
            "@/integrations/supabase/client.server"
          );

        const {
          processGenerationQueue,
        } =
          await import(
            "@/lib/content-queue.server"
          );

        const {
          processVideoQueue,
        } =
          await import(
            "@/lib/video-queue.server"
          );

        let generated = 0;
        let imagesStored = 0;

        try {
          for (
            let pass = 0;
            pass < 5;
            pass += 1
          ) {
            const result =
              await processGenerationQueue(
                supabaseAdmin,
              );

            generated +=
              result.generated;

            if (
              !result.generated
            ) {
              break;
            }
          }

          for (
            let pass = 0;
            pass < 5;
            pass += 1
          ) {
            const result =
              await processVideoQueue(
                supabaseAdmin,
                context.userId,
              );

            imagesStored +=
              result.imagesStored;

            if (
              !result.imagesStored
            ) {
              break;
            }
          }
        } catch (
          kickError
        ) {
          console.error(
            kickError,
          );
        }

        return {
          queued:
            scheduledDates.length,
          skipped:
            futureDates.length -
            dates.length,
          from:
            scheduledDates[0],
          plan:
            entitlement.plan.name,
          content:
            entitlement.plan
              .monthlyContent,
          generated,
          imagesStored,
        };
      },
    );

/**
 * ============================================================
 * CALENDAR REFRESH
 * ============================================================
 *
 * Deletes ALL generated content for the CURRENT MONTH
 * belonging to the authenticated user.
 *
 * It also removes:
 *
 * - Current month's generation job
 * - Generated image files
 * - Generated video files
 * - Generated voiceover files
 *
 * It does NOT affect:
 *
 * - Brand Profile
 * - Connected social accounts
 * - Previous months
 * - Future months
 * - Other users
 */
export const clearCurrentMonthContent =
  createServerFn({
    method: "POST",
  })
    .middleware([
      requireSupabaseAuth,
    ])
    .handler(
      async ({ context }) => {
        /*
         * Calculate current month on the SERVER.
         *
         * We intentionally do not accept a month
         * from the browser for this operation.
         */
        const today =
          new Date()
            .toISOString()
            .slice(0, 10);

        const currentMonth =
          today.slice(0, 7);

        const monthStart =
          `${currentMonth}-01`;

        /*
         * Calculate final day of current month.
         */
        const nextMonth =
          new Date(
            `${monthStart}T00:00:00.000Z`,
          );

        nextMonth.setUTCMonth(
          nextMonth.getUTCMonth() +
            1,
        );

        const monthEnd =
          new Date(
            nextMonth,
          );

        monthEnd.setUTCDate(0);

        const monthEndDate =
          monthEnd
            .toISOString()
            .slice(0, 10);

        /*
         * First read the content items so that
         * we know which generated media files
         * need to be removed.
         */
        const {
          data: items,
          error: readError,
        } =
          await context.supabase
            .from(
              "content_items",
            )
            .select(
              "id, image_url, video_url, voiceover_url",
            )
            .eq(
              "user_id",
              context.userId,
            )
            .gte(
              "scheduled_date",
              monthStart,
            )
            .lte(
              "scheduled_date",
              monthEndDate,
            );

        if (readError) {
          throw new Error(
            readError.message,
          );
        }

        /*
         * Collect generated media paths.
         */
        const mediaPaths =
          (items ?? [])
            .flatMap(
              (item) => [
                item.image_url,
                item.video_url,
                item.voiceover_url,
              ],
            )
            .filter(
              (
                path,
              ): path is string =>
                typeof path ===
                  "string" &&
                path.length > 0,
            );

        /*
         * ======================================================
         * STEP 1
         * Delete the durable generation job FIRST.
         *
         * This prevents an existing queued job from
         * recreating content after the calendar is cleared.
         * ======================================================
         */
        const {
          error: jobError,
        } =
          await context.supabase
            .from(
              "content_generation_jobs",
            )
            .delete()
            .eq(
              "user_id",
              context.userId,
            )
            .eq(
              "month",
              currentMonth,
            );

        if (jobError) {
          throw new Error(
            jobError.message,
          );
        }

        /*
         * ======================================================
         * STEP 2
         * Delete all current-month content.
         *
         * RLS still restricts this to the authenticated user.
         * ======================================================
         */
        const {
          error: contentError,
        } =
          await context.supabase
            .from(
              "content_items",
            )
            .delete()
            .eq(
              "user_id",
              context.userId,
            )
            .gte(
              "scheduled_date",
              monthStart,
            )
            .lte(
              "scheduled_date",
              monthEndDate,
            );

        if (contentError) {
          throw new Error(
            contentError.message,
          );
        }

        /*
         * ======================================================
         * STEP 3
         * Remove generated media from Supabase Storage.
         *
         * We do this AFTER database deletion so that a storage
         * problem does not leave the calendar populated.
         * ======================================================
         */
        if (
          mediaPaths.length > 0
        ) {
          const {
            error:
              storageError,
          } =
            await context.supabase.storage
              .from(
                "content-media",
              )
              .remove(
                mediaPaths,
              );

          /*
           * The calendar database deletion has already succeeded.
           * A storage cleanup problem should therefore not make
           * the user think the calendar deletion failed.
           */
          if (
            storageError
          ) {
            console.warn(
              "Calendar content deleted, but some generated media could not be removed:",
              storageError.message,
            );
          }
        }

        return {
          month:
            currentMonth,
          deleted:
            items?.length ?? 0,
          mediaDeleted:
            mediaPaths.length,
        };
      },
    );