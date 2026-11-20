/** Auto-posts scheduled content whose time has arrived. Server-only. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { publishItemToChannels } from "./publish.server";
import { isVideoType, isImageType } from "@/lib/content.server";

type Admin = SupabaseClient<never, never, never>;

const BATCH = 5;

/**
 * Posting times are India time: scheduled_time "10:00" means 10:00 IST. Dates and
 * times are compared in IST so an item is never posted hours early or late.
 */
const IST_OFFSET_MS = 5.5 * 3600 * 1000;

export function istNow(now: Date): { today: string; time: string } {
  const ist = new Date(now.getTime() + IST_OFFSET_MS).toISOString();
  return { today: ist.slice(0, 10), time: ist.slice(11, 19) };
}

export interface PublishQueueOptions {
  /**
   * Legacy daily autopost: publish everything due today whatever time each item shows.
   * Leave false (the default) to post each item at its own scheduled_time.
   */
  ignoreTime?: boolean;
  batch?: number;
  /** Items already tried in this run, so a failing item is not retried straight away. */
  skipIds?: Set<string>;
}

export async function processPublishQueue(admin: Admin, opts: PublishQueueOptions = {}) {
  const batchSize = opts.batch ?? BATCH;
  const { today, time } = istNow(new Date());

  // Admin Portal switch (Automation tab): when OFF, nothing is posted automatically.
  // Manual "Post now" is not affected. Read live, so it applies on the next run.
  const { getAutomationSetting } = await import("@/lib/app-settings.server");
  if (!(await getAutomationSetting(admin, "autopost_enabled"))) {
    return { publishChecked: 0, publishPosted: 0, publishFailed: 0, skipped: "autopost is switched off in the Admin Portal" };
  }

  let query = admin
    .from("content_items")
    .select(
      "id, user_id, type, platforms, scheduled_date, scheduled_time, reviewed_at, image_url, video_url, carousel_slides, carousel_image_urls",
    )
    .eq("status", "scheduled")
    .eq("enabled", true)
    .eq("autopost", true)
    .lte("scheduled_date", today)
    .lt("publish_attempts", 3);
  // Only fetch what is already due, so posts that are due later today can never
  // crowd out the ones that are due now.
  if (!opts.ignoreTime) {
    query = query.or(
      `scheduled_date.lt.${today},and(scheduled_date.eq.${today},scheduled_time.lte.${time})`,
    );
  }
  const { data } = await query
    .order("scheduled_date", { ascending: true })
    .order("scheduled_time", { ascending: true })
    .limit(batchSize * 4);

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    user_id: string;
    type: string;
    platforms: string[] | null;
    scheduled_date: string;
    scheduled_time: string | null;
    reviewed_at: string | null;
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
  //  - Autopost ON : every due card is posted (no review step).
  //  - Autopost OFF: only cards the user has reviewed ("Reviewed - Ready to Post") are posted.
  // Either way only cards dated today or earlier are picked up, never tomorrow's.
  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const autopostUsers = new Set<string>();
  const allowedUsers = new Set<string>(userIds);
  if (userIds.length > 0) {
    const { data: enabled } = await (
      admin as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            in: (
              c: string,
              v: string[],
            ) => {
              eq: (c: string, v: boolean) => Promise<{ data: Array<{ id: string }> | null }>;
            };
          };
        };
      }
    )
      .from("profiles")
      .select("id")
      .in("id", userIds)
      .eq("autopost_enabled", true);
    for (const row of enabled ?? []) autopostUsers.add(row.id);

    // Plans are prepaid 30-day periods. Once a plan has lapsed, its scheduled
    // posts are left untouched (not marked as failed) and go out only after
    // the plan is renewed.
    const { usersWithAccess } = await import("@/lib/generation-entitlements");
    const paid = await usersWithAccess(admin as never, [...allowedUsers]);
    for (const id of [...allowedUsers]) if (!paid.has(id)) allowedUsers.delete(id);
  }

  const due = rows
    .filter((row) => allowedUsers.has(row.user_id))
    .filter((row) => autopostUsers.has(row.user_id) || Boolean(row.reviewed_at))
    .filter((row) => !opts.skipIds?.has(row.id))
    .filter(
      (row) =>
        opts.ignoreTime || row.scheduled_date < today || (row.scheduled_time ?? "00:00:00") <= time,
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
