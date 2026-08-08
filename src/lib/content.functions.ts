import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const weekInput = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1).max(8),
});

const monthInput = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1).max(31),
});


export const generateWeek = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => weekInput.parse(input))
  .handler(async ({ data, context }) => {
    const { chatJSON } = await import("@/lib/ai.server");
    const helpers = await import("@/lib/content.server");

    const { data: brand } = await context.supabase
      .from("brand_profiles")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();

    if (!brand || !brand.business_name) {
      throw new Error("Complete your Brand Profile before generating content.");
    }

    const platforms = helpers.activePlatforms(brand as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { latestStrategy } = await import("@/lib/strategy-queue.server");
    const strategy = await latestStrategy(supabaseAdmin, context.userId);
    const result = await chatJSON<{ days?: Array<Record<string, unknown>> }>(
      helpers.SYSTEM_PROMPT,
      helpers.weekPrompt(brand as never, data.dates, strategy),
    );


    const days = (result.days ?? []) as Array<{ date?: string }>;
    const rows = data.dates.flatMap((date, index) => {
      const day = days.find((d) => d.date === date) ?? days[index] ?? {};
      return helpers.rowsForDay(day, { userId: context.userId, date, platforms });
    });

    if (!rows.length) throw new Error("The generator returned no content. Please try again.");

    await context.supabase
      .from("content_items")
      .delete()
      .eq("user_id", context.userId)
      .in("scheduled_date", data.dates);

    const { error } = await context.supabase.from("content_items").insert(rows as never);
    if (error) throw new Error(error.message);

    return { created: rows.length };
  });

/** Generates the visuals for a batch of items in one round-trip (no per-item clicks). */
export const generateMediaBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ ids: z.array(z.string().uuid()).min(1).max(4) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { generateImageBytes } = await import("@/lib/ai.server");
    const { imagePromptFor } = await import("@/lib/content.server");

    const { data: items } = await context.supabase
      .from("content_items")
      .select("id, type, title, summary, image_prompt, image_url")
      .eq("user_id", context.userId)
      .in("id", data.ids);

    const { data: brand } = await context.supabase
      .from("brand_profiles")
      .select("business_name, description, products_services, tone, propositions, icp")
      .eq("user_id", context.userId)
      .maybeSingle();

    const results = await Promise.allSettled(
      (items ?? [])
        .filter((item) => !item.image_url)
        .map(async (item) => {
          const bytes = await generateImageBytes(imagePromptFor(item as never, brand as never));
          const path = `${context.userId}/${item.id}.png`;
          const { error: uploadError } = await context.supabase.storage
            .from("content-media")
            .upload(path, bytes, { contentType: "image/png", upsert: true });
          if (uploadError) throw new Error(uploadError.message);
          await context.supabase
            .from("content_items")
            .update({ image_url: path })
            .eq("id", item.id)
            .eq("user_id", context.userId);
        }),
    );

    return { done: results.filter((r) => r.status === "fulfilled").length };
  });

export const generateItemImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { generateImageBytes } = await import("@/lib/ai.server");
    const { imagePromptFor } = await import("@/lib/content.server");

    const { data: item, error: readError } = await context.supabase
      .from("content_items")
      .select("id, type, title, summary, image_prompt")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .single();
    if (readError || !item) throw new Error("Content item not found.");

    const { data: brand } = await context.supabase
      .from("brand_profiles")
      .select("business_name, description, products_services, tone")
      .eq("user_id", context.userId)
      .maybeSingle();

    const bytes = await generateImageBytes(imagePromptFor(item as never, brand as never));
    const path = `${context.userId}/${item.id}.png`;

    const { error: uploadError } = await context.supabase.storage
      .from("content-media")
      .upload(path, bytes, { contentType: "image/png", upsert: true });
    if (uploadError) throw new Error(uploadError.message);

    const { error: updateError } = await context.supabase
      .from("content_items")
      .update({ image_url: path })
      .eq("id", item.id)
      .eq("user_id", context.userId);
    if (updateError) throw new Error(updateError.message);

    return { path };
  });

/** Kicks off a real AI-generated lifestyle video (async job, ~1-3 min). */
export const startItemVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { createVideoJob } = await import("@/lib/ai.server");
    const { videoPromptFor } = await import("@/lib/content.server");

    const { data: item, error: readError } = await context.supabase
      .from("content_items")
      .select("id, title, summary, video_script, image_prompt, video_url, video_job_id, video_status")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .single();
    if (readError || !item) throw new Error("Content item not found.");
    if (item.video_url) return { status: "completed" as const, jobId: item.video_job_id };
    if (item.video_status === "generating" && item.video_job_id) {
      return { status: "generating" as const, jobId: item.video_job_id };
    }

    const { data: brand } = await context.supabase
      .from("brand_profiles")
      .select("business_name, description, products_services, icp, tone")
      .eq("user_id", context.userId)
      .maybeSingle();

    const job = await createVideoJob(videoPromptFor(item as never, brand as never));

    await context.supabase
      .from("content_items")
      .update({ video_job_id: job.id, video_status: "generating", video_error: null })
      .eq("id", item.id)
      .eq("user_id", context.userId);

    return { status: "generating" as const, jobId: job.id };
  });

/** Polls the video job; stores the MP4 permanently once it is ready. */
export const pollItemVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { getVideoJob, downloadVideoBytes } = await import("@/lib/ai.server");

    const { data: item, error: readError } = await context.supabase
      .from("content_items")
      .select("id, video_url, video_job_id, video_status")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .single();
    if (readError || !item) throw new Error("Content item not found.");
    if (item.video_url) return { status: "completed" as const, path: item.video_url, progress: 100 };
    if (!item.video_job_id) return { status: "none" as const, path: null, progress: 0 };

    const job = await getVideoJob(item.video_job_id);

    if (job.status === "failed") {
      const message = job.error?.message ?? "Video generation failed.";
      await context.supabase
        .from("content_items")
        .update({ video_status: "failed", video_error: message })
        .eq("id", item.id)
        .eq("user_id", context.userId);
      return { status: "failed" as const, path: null, progress: 0, error: message };
    }

    if (job.status !== "completed") {
      return { status: "generating" as const, path: null, progress: job.progress ?? 0 };
    }

    const bytes = await downloadVideoBytes(item.video_job_id);
    const path = `${context.userId}/${item.id}.mp4`;

    const { error: uploadError } = await context.supabase.storage
      .from("content-media")
      .upload(path, bytes, { contentType: "video/mp4", upsert: true });
    if (uploadError) throw new Error(uploadError.message);

    const { error: updateError } = await context.supabase
      .from("content_items")
      .update({ video_url: path, video_status: "completed", video_error: null })
      .eq("id", item.id)
      .eq("user_id", context.userId);
    if (updateError) throw new Error(updateError.message);

    return { status: "completed" as const, path, progress: 100 };
  });

export const generateItemVoiceover = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { generateSpeechBytes } = await import("@/lib/ai.server");
    const { narrationFromScript } = await import("@/lib/content.server");

    const { data: item, error: readError } = await context.supabase
      .from("content_items")
      .select("id, title, summary, video_script, voiceover_url")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .single();
    if (readError || !item) throw new Error("Content item not found.");
    if (item.voiceover_url) return { path: item.voiceover_url };

    const narration = narrationFromScript(
      item.video_script ?? "",
      `${item.title}. ${item.summary ?? ""}`,
    );
    const bytes = await generateSpeechBytes(narration);
    const path = `${context.userId}/${item.id}-voiceover.mp3`;

    const { error: uploadError } = await context.supabase.storage
      .from("content-media")
      .upload(path, bytes, { contentType: "audio/mpeg", upsert: true });
    if (uploadError) throw new Error(uploadError.message);

    const { error: updateError } = await context.supabase
      .from("content_items")
      .update({ voiceover_url: path })
      .eq("id", item.id)
      .eq("user_id", context.userId);
    if (updateError) throw new Error(updateError.message);

    return { path };
  });

/** Starts/resumes the durable video worker after a month has been generated. */
export const processVideoQueueNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { processVideoQueue } = await import("@/lib/video-queue.server");
    return processVideoQueue(supabaseAdmin);
  });

/**
 * Queues an entire month for durable server-side generation. Once queued, the
 * recurring backend worker writes and renders every day even if the user logs
 * out, closes the tab or navigates away.
 *
 * Past days and days that were already posted are never touched: re-running
 * this mid-month refreshes only the remaining days, so brand-profile updates
 * (new products, services, events) flow into the rest of the month.
 */
export const queueMonthGeneration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => monthInput.parse(input))

  .handler(async ({ data, context }) => {
    const { data: brand } = await context.supabase
      .from("brand_profiles")
      .select("business_name")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!brand || !brand.business_name) {
      throw new Error("Complete your Brand Profile before generating content.");
    }

    const today = new Date().toISOString().slice(0, 10);
    const futureDates = data.dates.filter((d) => d >= today);

    // Anything already published stays untouched, even if it is dated today.
    const { data: posted } = await context.supabase
      .from("content_items")
      .select("scheduled_date")
      .eq("user_id", context.userId)
      .eq("status", "posted")
      .in("scheduled_date", futureDates.length ? futureDates : ["1970-01-01"]);
    const postedDates = new Set((posted ?? []).map((r) => r.scheduled_date as string));
    const dates = futureDates.filter((d) => !postedDates.has(d));

    if (!dates.length) {
      throw new Error("No upcoming days left to generate in this month.");
    }


    await context.supabase
      .from("content_generation_jobs")
      .delete()
      .eq("user_id", context.userId)
      .eq("month", data.month);

    const { error } = await context.supabase.from("content_generation_jobs").insert({
      user_id: context.userId,
      month: data.month,
      pending_dates: dates,
      days_total: dates.length,
      days_done: 0,
      status: "pending",
    } as never);

    if (error) throw new Error(error.message);

    // Kick the durable worker straight away so the first days land immediately
    // instead of waiting for the next scheduled cycle.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { processGenerationQueue } = await import("@/lib/content-queue.server");
    const { processVideoQueue } = await import("@/lib/video-queue.server");
    try {
      await processGenerationQueue(supabaseAdmin);
      await processVideoQueue(supabaseAdmin);
    } catch (kickError) {
      console.error(kickError);
    }

    return { queued: dates.length, skipped: data.dates.length - dates.length, from: dates[0] };
  });

