import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  createVideoJob,
  downloadVideoBytes,
  generateImageBytes,
  getVideoJob,
} from "@/lib/ai.server";
import { imagePromptFor, videoPromptFor } from "@/lib/content.server";

type AdminClient = SupabaseClient<Database>;

const ACTIVE_LIMIT = 2;
const IMAGE_BATCH_LIMIT = 6;

export async function processVideoQueue(admin: AdminClient) {
  const { data: active, error: activeError } = await admin
    .from("content_items")
    .select("id, user_id, video_job_id")
    .eq("type", "video")
    .eq("video_status", "generating")
    .is("video_url", null)
    .order("updated_at", { ascending: true })
    .limit(12);
  if (activeError) throw new Error(activeError.message);

  let stored = 0;
  let failed = 0;
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
  // every infographic request in this worker cycle to finish first.
  const activeCount = (active ?? []).length - stored - failed;
  const available = Math.max(0, ACTIVE_LIMIT - activeCount);
  let started = 0;

  if (available > 0) {
    const { data: pending, error: pendingError } = await admin
      .from("content_items")
      .select("id, user_id, title, summary, video_script, image_prompt")
      .eq("type", "video")
      .eq("video_status", "none")
      .is("video_url", null)
      .order("scheduled_date", { ascending: true })
      .order("scheduled_time", { ascending: true })
      .limit(available);
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

  // Render missing infographics and video thumbnails in the durable worker too.
  // This makes asset creation continue after the user closes the calendar.
  const { data: pendingImages, error: pendingImagesError } = await admin
    .from("content_items")
    .select("id, user_id, type, title, summary, image_prompt")
    .neq("type", "blog")
    .is("image_url", null)
    .order("scheduled_date", { ascending: true })
    .order("scheduled_time", { ascending: true })
    .limit(IMAGE_BATCH_LIMIT);
  if (pendingImagesError) throw new Error(pendingImagesError.message);

  const imageResults = await Promise.allSettled(
    (pendingImages ?? []).map(async (item) => {
      const { data: brand } = await admin
        .from("brand_profiles")
        .select("business_name, description, products_services, icp, propositions, tone")
        .eq("user_id", item.user_id)
        .maybeSingle();
      const bytes = await generateImageBytes(imagePromptFor(item as never, brand));
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
      return item.id;
    }),
  );
  imageResults.forEach((result) => {
    if (result.status === "rejected") console.error(result.reason);
  });
  const imagesStored = imageResults.filter((result) => result.status === "fulfilled").length;

  return { started, stored, failed, imagesStored };
}