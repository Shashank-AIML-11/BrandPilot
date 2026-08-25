/** Publishes one content item to a set of channels and records the outcome. */
import { publishToChannel, type PublishItem, type PublishResult } from "./publishers.server";

export async function publishItemToChannels(
  userId: string,
  itemId: string,
  channels: string[],
): Promise<{ results: PublishResult[] }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data } = await supabaseAdmin
    .from("content_items")
    .select(
      "id, type, title, summary, body, caption, hashtags, image_url, video_url, carousel_slides, carousel_image_urls, published_channels",
    )
    .eq("id", itemId)
    .eq("user_id", userId)
    .maybeSingle();

  const item = data as unknown as (PublishItem & { published_channels: string[] | null }) | null;
  if (!item) throw new Error("Content not found");

  const already = new Set(item.published_channels ?? []);
  const targets = channels.filter((c) => !already.has(c));
  const results: PublishResult[] = [];

  for (const channel of targets) {
    const result = await publishToChannel(supabaseAdmin as never, userId, channel, item);
    results.push(result);
    await supabaseAdmin.from("publish_log").insert({
      user_id: userId,
      content_item_id: item.id,
      channel,
      status: result.ok ? (result.manual ? "manual" : "posted") : "failed",
      external_id: result.externalId ?? "",
      external_url: result.externalUrl ?? "",
      error: result.error ?? "",
    } as never);
    if (result.ok) already.add(channel);
  }

  const succeeded = results.filter((r) => r.ok).length;
  if (succeeded > 0) {
    await supabaseAdmin
      .from("content_items")
      .update({
        status: "posted",
        posted_at: new Date().toISOString(),
        published_channels: Array.from(already),
      } as never)
      .eq("id", item.id);
  }

  await supabaseAdmin
    .from("content_items")
    .update({ publish_attempts: (already.size || 0) + results.length } as never)
    .eq("id", item.id);

  return { results };
}
