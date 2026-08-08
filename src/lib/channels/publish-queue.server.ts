/** Auto-posts scheduled content whose time has arrived. Server-only. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { publishItemToChannels } from "./publish.server";

type Admin = SupabaseClient<never, never, never>;

const BATCH = 5;

export async function processPublishQueue(admin: Admin) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const time = now.toISOString().slice(11, 19);

  const { data } = await admin
    .from("content_items")
    .select("id, user_id, type, platforms, scheduled_date, scheduled_time, image_url, video_url")
    .eq("status", "scheduled")
    .eq("enabled", true)
    .eq("autopost", true)
    .lte("scheduled_date", today)
    .lt("publish_attempts", 3)
    .order("scheduled_date", { ascending: true })
    .limit(BATCH * 4);

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    user_id: string;
    type: string;
    platforms: string[] | null;
    scheduled_date: string;
    scheduled_time: string | null;
    image_url: string | null;
    video_url: string | null;
  }>;

  const due = rows
    .filter((row) => row.scheduled_date < today || (row.scheduled_time ?? "00:00:00") <= time)
    .filter((row) => (row.platforms ?? []).length > 0)
    // Only publish once the media the channel needs actually exists.
    .filter((row) =>
      row.type === "video" ? Boolean(row.video_url) : row.type === "infographic" ? Boolean(row.image_url) : true,
    )
    .slice(0, BATCH);

  let posted = 0;
  let failed = 0;

  for (const row of due) {
    try {
      const { results } = await publishItemToChannels(row.user_id, row.id, row.platforms ?? []);
      if (results.some((r) => r.ok)) posted += 1;
      if (results.some((r) => !r.ok)) failed += 1;
    } catch (error) {
      failed += 1;
      console.error("[publish-queue]", error);
      await admin
        .from("content_items")
        .update({ publish_attempts: 3 } as never)
        .eq("id", row.id);
    }
  }

  return { publishChecked: due.length, publishPosted: posted, publishFailed: failed };
}
