/** Auto-posts scheduled content whose time has arrived. Server-only. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { publishItemToChannels } from "./publish.server";
import { isVideoType, isImageType } from "@/lib/content.server";

type Admin = SupabaseClient<never, never, never>;

const BATCH = 5;

export interface PublishQueueOptions {
  /** Daily 7 AM autopost: publish everything due today, whatever time each item shows. */
  ignoreTime?: boolean;
  batch?: number;
  /** Items already tried in this run, so a failing item is not retried straight away. */
  skipIds?: Set<string>;
}

export async function processPublishQueue(admin: Admin, opts: PublishQueueOptions = {}) {
  const batchSize = opts.batch ?? BATCH;
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const time = now.toISOString().slice(11, 19);

  const { data } = await admin
    .from("content_items")
    .select(
      "id, user_id, type, platforms, scheduled_date, scheduled_time, image_url, video_url, carousel_slides, carousel_image_urls",
    )
    .eq("status", "scheduled")
    .eq("enabled", true)
    .eq("autopost", true)
    .lte("scheduled_date", today)
    .lt("publish_attempts", 3)
    .order("scheduled_date", { ascending: true })
    .limit(batchSize * 4);

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    user_id: string;
    type: string;
    platforms: string[] | null;
    scheduled_date: string;
    scheduled_time: string | null;
    image_url: string | null;
    video_url: string | null;
    carousel_slides: unknown[] | null;
    carousel_image_urls: string[] | null;
  }>;

  function mediaReady(row: (typeof rows)[number]): boolean {
    if (isVideoType(row.type)) return Boolean(row.video_url);
    if (isImageType(row.type)) return Boolean(row.image_url);
    if (row.type === "carousel") {
      const slideCount = row.carousel_slides?.length ?? 0;
      const imageCount = (row.carousel_image_urls ?? []).filter(Boolean).length;
      return slideCount > 0 && imageCount >= slideCount;
    }
    return true; // blog — no media required
  }

  // Account-wide Autopost switch (header toggle), OFF unless the user turned it ON.
  // Accounts that are OFF (or have no setting yet) are skipped: their posts stay
  // scheduled and go out only through the manual Post now button.
  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const allowedUsers = new Set<string>();
  if (userIds.length > 0) {
    const { data: enabled } = await (admin as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          in: (c: string, v: string[]) => {
            eq: (c: string, v: boolean) => Promise<{ data: Array<{ id: string }> | null }>;
          };
        };
      };
    })
      .from("profiles")
      .select("id")
      .in("id", userIds)
      .eq("autopost_enabled", true);
    for (const row of enabled ?? []) allowedUsers.add(row.id);
  }

  const due = rows
    .filter((row) => allowedUsers.has(row.user_id))
    .filter((row) => !opts.skipIds?.has(row.id))
    .filter(
      (row) =>
        opts.ignoreTime ||
        row.scheduled_date < today ||
        (row.scheduled_time ?? "00:00:00") <= time,
    )
    .filter((row) => (row.platforms ?? []).length > 0)
    // Only publish once the media the channel needs actually exists.
    .filter(mediaReady)
    .slice(0, batchSize);

  let posted = 0;
  let failed = 0;

  for (const row of due) {
    opts.skipIds?.add(row.id);
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
