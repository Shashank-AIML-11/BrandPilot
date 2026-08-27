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
        helpers.buildWeekResponseSchema(quotaSchedule),
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
          carouselSlideImagePromptFor,
        } =
          await import(
            "@/lib/content.server"
          );

        const { data: items } =
          await context.supabase
            .from("content_items")
            .select(
              "id, type, title, summary, image_prompt, image_url, carousel_slides, carousel_image_urls",
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

        // Blog never has an image. Carousel needs one image per slide
        // instead of a single image_url — handled separately below.
        const singleImageItems = (items ?? []).filter(
          (item) => item.type !== "blog" && item.type !== "carousel" && !item.image_url,
        );
        const carouselItems = (items ?? []).filter(
          (item) =>
            item.type === "carousel" &&
            (item.carousel_slides as unknown[] | null)?.length,
        );

        const singleResults =
          await Promise.allSettled(
            singleImageItems.map(
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

        // One image per carousel slide, skipping slides that already
        // have a rendered image (so a partial batch can resume cleanly).
        const carouselResults = await Promise.allSettled(
          carouselItems.map(async (item) => {
            const slides = (item.carousel_slides ?? []) as Array<{
              headline?: string;
              subtext?: string;
              image_prompt?: string;
            }>;
            const existingUrls = [...((item.carousel_image_urls as string[] | null) ?? [])];

            for (let i = 0; i < slides.length; i += 1) {
              if (existingUrls[i]) continue; // already rendered
              const bytes = await generateImageBytes(
                carouselSlideImagePromptFor(slides[i]!, i, slides.length, brand as never),
              );
              const path = `${context.userId}/${item.id}-slide-${i}.png`;
              const { error: uploadError } = await context.supabase.storage
                .from("content-media")
                .upload(path, bytes, { contentType: "image/png", upsert: true });
              if (uploadError) throw new Error(uploadError.message);
              existingUrls[i] = path;
            }

            await context.supabase
              .from("content_items")
              .update({ carousel_image_urls: existingUrls } as never)
              .eq("id", item.id)
              .eq("user_id", context.userId);
          }),
        );

        return {
          done:
            singleResults.filter((r) => r.status === "fulfilled").length +
            carouselResults.filter((r) => r.status === "fulfilled").length,
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

        if (item.type === "carousel") {
          throw new Error(
            "Carousels render one image per slide — use the carousel slide regenerate action instead.",
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
              "id, type, title, summary, video_script, image_prompt, video_url, video_job_id, video_status",
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
 * Queue TODAY ONLY for durable server-side generation.
 *
 * IMPORTANT:
 * This function ONLY creates the database job.
 *
 * It does NOT execute the AI generation.
 *
 * This prevents the Generate Content button
 * from waiting several minutes.
 *
 * NOTE: previously this queued every remaining day in the current
 * month in one go (today -> end of month), which meant a single
 * Groq call in generateWeek()/processGenerationQueue() had to
 * produce valid JSON for many days of content at once — the more
 * days requested, the larger and more failure-prone that single
 * JSON response became. Restricting this to today only keeps each
 * generation batch small and reliable. Re-run "Generate Content"
 * daily (or wire up a daily cron hitting this + processGenerationQueueNow)
 * to fill in the rest of the month day by day.
 */
export const queueMonthGeneration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => monthInput.parse(input))

  .handler(async ({ data, context }) => {
    const { getGenerationEntitlement } = await import("@/lib/generation-entitlements");

    const entitlement = await getGenerationEntitlement(context.supabase, context.userId);

    /*
     * Verify Brand Profile.
     */
    const { data: brand } = await context.supabase
      .from("brand_profiles")
      .select("business_name")
      .eq("user_id", context.userId)
      .maybeSingle();

    if (!brand || !brand.business_name) {
      throw new Error("Complete your Brand Profile before generating content.");
    }

    /*
     * Only current month is allowed.
     */
    const today = new Date().toISOString().slice(0, 10);
    const currentMonth = today.slice(0, 7);

    if (data.month !== currentMonth) {
      throw new Error("Content can only be generated from today through the end of the current month.");
    }

    /*
     * Generate for TODAY ONLY.
     *
     * (Previously this built a full today -> end-of-month date list.
     * See the note above the function for why that was reduced.)
     */
    const futureDates: string[] = [today];

    /*
     * Do not regenerate already posted days.
     */
    const { data: posted } = await context.supabase
      .from("content_items")
      .select("scheduled_date")
      .eq("user_id", context.userId)
      .eq("status", "posted")
      .in("scheduled_date", futureDates);

    const postedDates = new Set((posted ?? []).map((row) => row.scheduled_date as string));
    const dates = futureDates.filter((date) => !postedDates.has(date));

    if (!dates.length) {
      throw new Error("No upcoming days left to generate in this month.");
    }

    const { distributeMonthlyContent, renderingRowsForDay, activePlatforms, CONTENT_TYPES } =
      await import("@/lib/content.server");

    /*
     * Video generation (instagram_reel, youtube_short, tiktok_video,
     * product_service_video) runs on Gemini and is paused during testing —
     * zero those four quotas out regardless of what the plan grants, same
     * as the old single "video: 0" override did for the 3-type system.
     */
    const VIDEO_TYPES_PAUSED = [
      "instagram_reel",
      "youtube_short",
      "tiktok_video",
      "product_service_video",
    ] as const;

    const monthlyTotals = { ...entitlement.plan.monthlyContent };
    for (const t of VIDEO_TYPES_PAUSED) {
      (monthlyTotals as Record<string, number>)[t] = 0;
    }

    /*
     * distributeMonthlyContent caps count = Math.min(want, dates.length)
     * per type — with dates.length === 1 (today only), every type gets
     * AT MOST 1 piece for today, never the full monthly total. Safe by
     * construction, no extra capping needed here.
     */
    const contentPlan = distributeMonthlyContent(dates, monthlyTotals);

    const scheduledDates = dates.filter((date) => {
      const quota = contentPlan[date];
      if (!quota) return false;
      return CONTENT_TYPES.some((t) => quota[t] > 0);
    });

    /*
     * Remove previous pending/running job for this user's current month.
     */
    await context.supabase
      .from("content_generation_jobs")
      .delete()
      .eq("user_id", context.userId)
      .eq("month", data.month);

    /*
     * CREATE JOB ONLY.
     *
     * CRITICAL:
     * DO NOT call processGenerationQueue() here.
     * DO NOT call processVideoQueue() here.
     * This function must return immediately.
     */

    /*
     * ============================================================
     * REMOVE PREVIOUS NON-POSTED CONTENT
     * ============================================================
     * Refresh Calendar normally removes everything. This additional
     * protection prevents duplicate calendar entries if Generate is
     * triggered again after a failed job.
     */
    const { error: deleteContentError } = await context.supabase
      .from("content_items")
      .delete()
      .eq("user_id", context.userId)
      .in("scheduled_date", scheduledDates)
      .neq("status", "posted");

    if (deleteContentError) {
      throw new Error(deleteContentError.message);
    }

    /*
     * ============================================================
     * CREATE DURABLE GENERATION JOB
     * ============================================================
     */
    const { data: generationJob, error: jobError } = await context.supabase
      .from("content_generation_jobs")
      .insert({
        user_id: context.userId,
        month: data.month,
        pending_dates: scheduledDates,
        days_total: scheduledDates.length,
        days_done: 0,
        status: "pending",
        content_plan: contentPlan,
        error: null,
      } as never)
      .select("id")
      .single();

    if (jobError || !generationJob) {
      throw new Error(jobError?.message ?? "Could not create generation job.");
    }

    /*
     * ============================================================
     * CREATE IMMEDIATE "RENDERING" CALENDAR ENTRIES
     * ============================================================
     */
    const activeChannelList = activePlatforms(brand as never).slice(
      0,
      entitlement.plan.channelLimit ?? undefined,
    );

    const renderingRows = scheduledDates.flatMap((date) => {
      const quota = contentPlan[date];
      if (!quota) return [];
      return renderingRowsForDay(
        { userId: context.userId, date, platforms: activeChannelList, autopost: entitlement.plan.autoPost },
        quota,
      );
    });

    if (renderingRows.length === 0) {
      // Clean up the job if we couldn't create any calendar entries.
      await context.supabase.from("content_generation_jobs").delete().eq("id", generationJob.id);
      throw new Error("No calendar content could be scheduled.");
    }

    const { error: renderingInsertError } = await context.supabase
      .from("content_items")
      .insert(renderingRows as never);

    if (renderingInsertError) {
      // Remove the orphan generation job.
      await context.supabase.from("content_generation_jobs").delete().eq("id", generationJob.id);
      throw new Error(`Could not create Rendering calendar entries: ${renderingInsertError.message}`);
    }

    /*
     * Return immediately.
     */
    return {
      queued: scheduledDates.length,
      skipped: futureDates.length - dates.length,
      from: scheduledDates[0],
      plan: entitlement.plan.name,
      content: entitlement.plan.monthlyContent,
      generated: 0,
      imagesStored: 0,
    };
  });



/**
 * Process ONE generation batch for the
 * authenticated user.
 *
 * This is deliberately separate from
 * queueMonthGeneration().
 */
export const processGenerationQueueNow =
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
          processGenerationQueue,
        } =
          await import(
            "@/lib/content-queue.server"
          );

        return processGenerationQueue(
          supabaseAdmin,
          context.userId,
        );
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
              "id, image_url, video_url, voiceover_url, carousel_image_urls",
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
                ...((item.carousel_image_urls as string[] | null) ?? []),
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
