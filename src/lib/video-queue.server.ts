import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  createVideoJob,
  downloadVideoBytes,
  generateImageBytes,
  getVideoJob,
} from "@/lib/ai.server";
import {
  imagePromptFor,
  videoPromptFor,
  carouselSlideImagePromptFor,
  CONTENT_TYPES,
  VIDEO_TYPES,
} from "@/lib/content.server";

type AdminClient = SupabaseClient<Database>;

const ACTIVE_LIMIT = 2;
const IMAGE_BATCH_LIMIT = 6;
const CAROUSEL_BATCH_LIMIT = 3;
const IMAGE_REQUEST_DELAY_MS = 1200;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Pollinations only allows 1 in-flight image request per IP. Serialize every
// call through here instead of firing them in parallel, and back off/retry
// specifically on 429s instead of failing the item immediately.
async function generateImageWithRetry(
  prompt: Parameters<typeof generateImageBytes>[0],
  maxAttempts = 3,
): Promise<Awaited<ReturnType<typeof generateImageBytes>>> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await generateImageBytes(prompt);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const isRateLimit = message.includes("429") || message.includes("Too Many Requests");
      if (isRateLimit && attempt < maxAttempts) {
        await sleep(3000 * attempt); // 3s, then 6s
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

// Everything except blog (no image at all) and carousel (multiple images,
// handled in its own loop below) goes through the single-image path —
// that includes the 4 video types, whose "image" is their thumbnail.
const SINGLE_IMAGE_TYPES = CONTENT_TYPES.filter((t) => t !== "blog" && t !== "carousel");

export async function processVideoQueue(admin: AdminClient, userId?: string) {
  const videoGenerationEnabled = process.env["VIDEO_GENERATION_ENABLED"] === "true";
  let started = 0;
  let stored = 0;
  let failed = 0;

  if (videoGenerationEnabled) {
    let activeQuery = admin
      .from("content_items")
      .select("id, user_id, video_job_id")
      .in("type", VIDEO_TYPES)
      .eq("video_status", "generating")
      .is("video_url", null)
      .order("updated_at", { ascending: true })
      .limit(12);
    if (userId) activeQuery = activeQuery.eq("user_id", userId);
    const { data: active, error: activeError } = await activeQuery;
    if (activeError) throw new Error(activeError.message);

    for (const item of active ?? []) {
      if (!item.video_job_id) continue;
      try {
        const job = await getVideoJob(item.video_job_id);
        if (job.status === "failed") {
          await admin
            .from("content_items")
            .update({
              video_status: "failed",
              video_error: job.error?.message ?? "Video generation failed.",
            })
            .eq("id", item.id);
          failed += 1;
          continue;
        }
        if (job.status !== "completed") continue;

        const bytes = await downloadVideoBytes(item.video_job_id);
        const path = `${item.user_id}/${item.id}.mp4`;
        const { error: uploadError } = await admin.storage
          .from("content-media")
          .upload(path, bytes, { contentType: "video/mp4", upsert: true });
        if (uploadError) throw new Error(uploadError.message);

        const { error: updateError } = await admin
          .from("content_items")
          .update({ video_url: path, video_status: "completed", video_error: null })
          .eq("id", item.id);
        if (updateError) throw new Error(updateError.message);
        stored += 1;
      } catch (error) {
        console.error(error);
        const message = error instanceof Error ? error.message : "Video storage failed.";
        const { error: updateError } = await admin
          .from("content_items")
          .update({ video_status: "failed", video_error: message })
          .eq("id", item.id)
          .eq("video_status", "generating");
        if (updateError) console.error(updateError);
        failed += 1;
      }
    }

    // Reserve video capacity before doing the slower image batch. This ensures
    // newly generated videos begin rendering immediately instead of waiting for
    // every image request in this worker cycle to finish first.
    const activeCount = (active ?? []).length - stored - failed;
    const available = Math.max(0, ACTIVE_LIMIT - activeCount);

    if (available > 0) {
      let pendingQuery = admin
        .from("content_items")
        .select("id, user_id, type, title, summary, video_script, image_prompt")
        .in("type", VIDEO_TYPES)
        .eq("video_status", "none")
        .is("video_url", null)
        .order("scheduled_date", { ascending: true })
        .order("scheduled_time", { ascending: true })
        .limit(available);
      if (userId) pendingQuery = pendingQuery.eq("user_id", userId);
      const { data: pending, error: pendingError } = await pendingQuery;
      if (pendingError) throw new Error(pendingError.message);

      for (const item of pending ?? []) {
        try {
          const { data: brand } = await admin
            .from("brand_profiles")
            .select("business_name, description, products_services, icp, tone")
            .eq("user_id", item.user_id)
            .maybeSingle();
          const job = await createVideoJob(
            videoPromptFor(
              {
                type: item.type,
                title: item.title,
                summary: item.summary ?? "",
                video_script: item.video_script ?? "",
                image_prompt: item.image_prompt ?? "",
              },
              brand,
            ),
          );
          const { error: updateError } = await admin
            .from("content_items")
            .update({ video_job_id: job.id, video_status: "generating", video_error: null })
            .eq("id", item.id)
            .eq("video_status", "none");
          if (updateError) throw new Error(updateError.message);
          started += 1;
        } catch (error) {
          console.error(error);
        }
      }
    }
  }

  // Render missing single-image posts and video thumbnails even while videos
  // are paused. Opening a calendar item must never trigger this work — this
  // makes asset creation continue after the user closes the calendar.
  let pendingImagesQuery = admin
    .from("content_items")
    .select("id, user_id, type, title, summary, image_prompt")
    .in("type", SINGLE_IMAGE_TYPES)
    .is("image_url", null)
    .order("scheduled_date", { ascending: true })
    .order("scheduled_time", { ascending: true })
    .limit(IMAGE_BATCH_LIMIT);
  if (userId) pendingImagesQuery = pendingImagesQuery.eq("user_id", userId);
  const { data: pendingImages, error: pendingImagesError } = await pendingImagesQuery;
  if (pendingImagesError) throw new Error(pendingImagesError.message);

  const imageResults: PromiseSettledResult<string>[] = [];
  for (const item of pendingImages ?? []) {
    try {
      const { data: brand } = await admin
        .from("brand_profiles")
        .select("business_name, description, products_services, icp, propositions, tone")
        .eq("user_id", item.user_id)
        .maybeSingle();
      const bytes = await generateImageWithRetry(imagePromptFor(item as never, brand));
      const path = `${item.user_id}/${item.id}.png`;
      const { error: uploadError } = await admin.storage
        .from("content-media")
        .upload(path, bytes, { contentType: "image/png", upsert: true });
      if (uploadError) throw new Error(uploadError.message);
      const { error: updateError } = await admin
        .from("content_items")
        .update({ image_url: path })
        .eq("id", item.id)
        .is("image_url", null);
      if (updateError) throw new Error(updateError.message);
      imageResults.push({ status: "fulfilled", value: item.id });
    } catch (error) {
      imageResults.push({ status: "rejected", reason: error });
    }
    await sleep(IMAGE_REQUEST_DELAY_MS);
  }
  imageResults.forEach((result) => {
    if (result.status === "rejected") console.error(result.reason);
  });
  const imagesStored = imageResults.filter((result) => result.status === "fulfilled").length;

  // Carousels don't fit the single image_url path above — each one needs
  // multiple slide images. Same "keep working after the calendar closes"
  // principle: pick up carousels with any un-rendered slide and fill them in.
  let pendingCarouselsQuery = admin
    .from("content_items")
    .select("id, user_id, carousel_slides, carousel_image_urls")
    .eq("type", "carousel")
    .order("scheduled_date", { ascending: true })
    .order("scheduled_time", { ascending: true })
    .limit(CAROUSEL_BATCH_LIMIT * 4); // over-fetch; most will already be complete
  if (userId) pendingCarouselsQuery = pendingCarouselsQuery.eq("user_id", userId);
  const { data: pendingCarouselsRaw, error: pendingCarouselsError } = await pendingCarouselsQuery;
  if (pendingCarouselsError) throw new Error(pendingCarouselsError.message);

  const pendingCarousels = (pendingCarouselsRaw ?? [])
    .filter((item) => {
      const slides = (item.carousel_slides as unknown[] | null) ?? [];
      const images = (item.carousel_image_urls as string[] | null) ?? [];
      return slides.length > 0 && images.filter(Boolean).length < slides.length;
    })
    .slice(0, CAROUSEL_BATCH_LIMIT);

  const carouselResults: PromiseSettledResult<string>[] = [];
  for (const item of pendingCarousels) {
    try {
      const { data: brand } = await admin
        .from("brand_profiles")
        .select("business_name, description, products_services, icp, propositions, tone")
        .eq("user_id", item.user_id)
        .maybeSingle();

      const slides = (item.carousel_slides as Array<{
        headline?: string;
        subtext?: string;
        image_prompt?: string;
      }>) ?? [];
      const urls = [...((item.carousel_image_urls as string[] | null) ?? [])];

      for (let i = 0; i < slides.length; i += 1) {
        if (urls[i]) continue;
        const bytes = await generateImageWithRetry(
          carouselSlideImagePromptFor(slides[i]!, i, slides.length, brand),
        );
        const path = `${item.user_id}/${item.id}-slide-${i}.png`;
        const { error: uploadError } = await admin.storage
          .from("content-media")
          .upload(path, bytes, { contentType: "image/png", upsert: true });
        if (uploadError) throw new Error(uploadError.message);
        urls[i] = path;
        await sleep(IMAGE_REQUEST_DELAY_MS);
      }

      const { error: updateError } = await admin
        .from("content_items")
        .update({ carousel_image_urls: urls } as never)
        .eq("id", item.id);
      if (updateError) throw new Error(updateError.message);
      carouselResults.push({ status: "fulfilled", value: item.id });
    } catch (error) {
      carouselResults.push({ status: "rejected", reason: error });
    }
  }
  carouselResults.forEach((result) => {
    if (result.status === "rejected") console.error(result.reason);
  });
  const carouselsStored = carouselResults.filter((result) => result.status === "fulfilled").length;

  return {
    started,
    stored,
    failed,
    imagesStored,
    carouselsStored,
    paused: !videoGenerationEnabled,
  };
}
