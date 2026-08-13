/** One publisher per channel. Server-only. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { liveConnection, type LiveConnection } from "./oauth.server";

type Admin = SupabaseClient<never, never, never>;

export interface PublishItem {
  id: string;
  type: string;
  title: string;
  summary: string | null;
  body: string | null;
  caption: string | null;
  hashtags: string | null;
  image_url: string | null;
  video_url: string | null;
}

export interface PublishResult {
  channel: string;
  ok: boolean;
  externalId?: string;
  externalUrl?: string;
  error?: string;
  manual?: boolean;
}

// LinkedIn retires versioned REST APIs regularly. Keep this configurable so a
// deployment can move to a newly supported version without a code release.
const LINKEDIN_VERSION = process.env.LINKEDIN_VERSION || "202606";

function textFor(item: PublishItem, limit = 3000): string {
  const parts = [item.title, item.caption || item.summary || "", item.hashtags || ""].filter(
    Boolean,
  );
  return parts.join("\n\n").slice(0, limit);
}

async function signed(admin: Admin, path: string | null): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const { data } = await admin.storage.from("content-media").createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

async function bytes(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not download media (${res.status})`);
  return res.arrayBuffer();
}

async function jsonOrThrow(channel: string, res: Response) {
  const text = await res.text();
  if (!res.ok) throw new Error(`${channel} API error [${res.status}]: ${text}`);
  return text ? (JSON.parse(text) as Record<string, never>) : {};
}

/* ---------------------------------- LinkedIn --------------------------------- */

async function publishLinkedIn(
  admin: Admin,
  conn: LiveConnection,
  item: PublishItem,
): Promise<PublishResult> {
  const author = `urn:li:person:${conn.accountId}`;
  const headers = {
    authorization: `Bearer ${conn.accessToken}`,
    "content-type": "application/json",
    "LinkedIn-Version": LINKEDIN_VERSION,
    "X-Restli-Protocol-Version": "2.0.0",
  };

  let imageUrn: string | null = null;
  const imageLink = await signed(admin, item.image_url);
  if (imageLink) {
    const init = (await jsonOrThrow(
      "LinkedIn",
      await fetch("https://api.linkedin.com/rest/images?action=initializeUpload", {
        method: "POST",
        headers,
        body: JSON.stringify({ initializeUploadRequest: { owner: author } }),
      }),
    )) as unknown as { value?: { uploadUrl: string; image: string } };
    if (init.value) {
      const upload = await fetch(init.value.uploadUrl, {
        method: "PUT",
        headers: { authorization: `Bearer ${conn.accessToken}` },
        body: await bytes(imageLink),
      });
      if (!upload.ok) throw new Error(`LinkedIn image upload failed (${upload.status})`);
      imageUrn = init.value.image;
    }
  }

  const postResponse = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers,
    body: JSON.stringify({
      author,
      commentary: textFor(item),
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED" },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
      ...(imageUrn
        ? { content: { media: { id: imageUrn, title: item.title.slice(0, 200) } } }
        : {}),
    }),
  });
  const post = (await jsonOrThrow("LinkedIn", postResponse)) as unknown as { id?: string };

  // The Posts API normally returns its identifier in this response header,
  // rather than in its JSON body.
  const id = postResponse.headers.get("x-restli-id") ?? post.id ?? "";
  return {
    channel: "LinkedIn",
    ok: true,
    externalId: id,
    externalUrl: id ? `https://www.linkedin.com/feed/update/${id}` : "",
  };
}

/* ---------------------------------- YouTube ---------------------------------- */

async function publishYouTube(
  admin: Admin,
  conn: LiveConnection,
  item: PublishItem,
): Promise<PublishResult> {
  const videoLink = await signed(admin, item.video_url);
  if (!videoLink) throw new Error("This item has no rendered video yet.");

  const metadata = {
    snippet: {
      title: item.title.slice(0, 100),
      description: textFor(item, 4800),
      categoryId: "22",
    },
    status: { privacyStatus: "public", selfDeclaredMadeForKids: false },
  };

  const start = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${conn.accessToken}`,
        "content-type": "application/json",
        "X-Upload-Content-Type": "video/mp4",
      },
      body: JSON.stringify(metadata),
    },
  );
  if (!start.ok) throw new Error(`YouTube init failed [${start.status}]: ${await start.text()}`);
  const location = start.headers.get("location");
  if (!location) throw new Error("YouTube did not return an upload URL.");

  const payload = await bytes(videoLink);
  const upload = await fetch(location, {
    method: "PUT",
    headers: { "content-type": "video/mp4", "content-length": String(payload.byteLength) },
    body: payload,
  });
  const result = (await jsonOrThrow("YouTube", upload)) as unknown as { id?: string };
  return {
    channel: "YouTube",
    ok: true,
    externalId: result.id ?? "",
    externalUrl: result.id ? `https://www.youtube.com/watch?v=${result.id}` : "",
  };
}

/* ---------------------------------- Facebook --------------------------------- */

async function publishFacebook(
  admin: Admin,
  conn: LiveConnection,
  item: PublishItem,
): Promise<PublishResult> {
  const pageId = (conn.meta["pageId"] as string) || conn.accountId;
  const imageLink = await signed(admin, item.image_url);
  const message = textFor(item);

  const url = imageLink
    ? `https://graph.facebook.com/v21.0/${pageId}/photos`
    : `https://graph.facebook.com/v21.0/${pageId}/feed`;
  const body = new URLSearchParams({ access_token: conn.accessToken, ...(imageLink ? { url: imageLink, caption: message } : { message }) });

  const res = (await jsonOrThrow(
    "Facebook",
    await fetch(url, { method: "POST", body }),
  )) as unknown as { id?: string; post_id?: string };
  const id = res.post_id ?? res.id ?? "";
  return {
    channel: "Facebook",
    ok: true,
    externalId: id,
    externalUrl: id ? `https://www.facebook.com/${id}` : "",
  };
}

/* --------------------------------- Instagram --------------------------------- */

async function publishInstagram(
  admin: Admin,
  conn: LiveConnection,
  item: PublishItem,
): Promise<PublishResult> {
  const igId = conn.accountId;
  const imageLink = await signed(admin, item.image_url);
  const videoLink = await signed(admin, item.video_url);
  if (!imageLink && !videoLink) throw new Error("Instagram needs an image or video.");

  const create = new URLSearchParams({
    access_token: conn.accessToken,
    caption: textFor(item, 2200),
    ...(videoLink ? { media_type: "REELS", video_url: videoLink } : { image_url: imageLink! }),
  });

  const container = (await jsonOrThrow(
    "Instagram",
    await fetch(`https://graph.facebook.com/v21.0/${igId}/media`, {
      method: "POST",
      body: create,
    }),
  )) as unknown as { id?: string };
  if (!container.id) throw new Error("Instagram did not return a media container.");

  // Video containers need a moment to finish processing before publishing.
  if (videoLink) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await new Promise((r) => setTimeout(r, 3000));
      const status = (await jsonOrThrow(
        "Instagram",
        await fetch(
          `https://graph.facebook.com/v21.0/${container.id}?fields=status_code&access_token=${encodeURIComponent(conn.accessToken)}`,
        ),
      )) as unknown as { status_code?: string };
      if (status.status_code === "FINISHED") break;
      if (status.status_code === "ERROR") throw new Error("Instagram could not process the video.");
    }
  }

  const published = (await jsonOrThrow(
    "Instagram",
    await fetch(`https://graph.facebook.com/v21.0/${igId}/media_publish`, {
      method: "POST",
      body: new URLSearchParams({ access_token: conn.accessToken, creation_id: container.id }),
    }),
  )) as unknown as { id?: string };

  return { channel: "Instagram", ok: true, externalId: published.id ?? "" };
}

/* ------------------------------------- X ------------------------------------- */

async function publishX(
  admin: Admin,
  conn: LiveConnection,
  item: PublishItem,
): Promise<PublishResult> {
  const mediaIds: string[] = [];
  const imageLink = await signed(admin, item.image_url);
  if (imageLink) {
    const form = new FormData();
    form.append("media", new Blob([await bytes(imageLink)], { type: "image/png" }), "image.png");
    form.append("media_category", "tweet_image");
    const media = (await jsonOrThrow(
      "X",
      await fetch("https://api.x.com/2/media/upload", {
        method: "POST",
        headers: { authorization: `Bearer ${conn.accessToken}` },
        body: form,
      }),
    )) as unknown as { data?: { id?: string }; media_id_string?: string };
    const id = media.data?.id ?? media.media_id_string;
    if (id) mediaIds.push(id);
  }

  const tweet = (await jsonOrThrow(
    "X",
    await fetch("https://api.x.com/2/tweets", {
      method: "POST",
      headers: {
        authorization: `Bearer ${conn.accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        text: textFor(item, 275),
        ...(mediaIds.length ? { media: { media_ids: mediaIds } } : {}),
      }),
    }),
  )) as unknown as { data?: { id?: string } };

  const id = tweet.data?.id ?? "";
  return {
    channel: "X",
    ok: true,
    externalId: id,
    externalUrl: id ? `https://x.com/i/web/status/${id}` : "",
  };
}

/* --------------------------------- Pinterest --------------------------------- */

async function publishPinterest(
  admin: Admin,
  conn: LiveConnection,
  item: PublishItem,
): Promise<PublishResult> {
  const boardId = conn.meta["boardId"] as string;
  if (!boardId) throw new Error("No Pinterest board found on the connected account.");
  const imageLink = await signed(admin, item.image_url);
  if (!imageLink) throw new Error("Pinterest needs an image.");

  const pin = (await jsonOrThrow(
    "Pinterest",
    await fetch("https://api.pinterest.com/v5/pins", {
      method: "POST",
      headers: {
        authorization: `Bearer ${conn.accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        board_id: boardId,
        title: item.title.slice(0, 100),
        description: textFor(item, 800),
        media_source: { source_type: "image_url", url: imageLink },
      }),
    }),
  )) as unknown as { id?: string };

  return {
    channel: "Pinterest",
    ok: true,
    externalId: pin.id ?? "",
    externalUrl: pin.id ? `https://www.pinterest.com/pin/${pin.id}` : "",
  };
}

/* ----------------------------------- TikTok ---------------------------------- */

async function publishTikTok(
  admin: Admin,
  conn: LiveConnection,
  item: PublishItem,
): Promise<PublishResult> {
  const videoLink = await signed(admin, item.video_url);
  if (!videoLink) throw new Error("This item has no rendered video yet.");
  const payload = await bytes(videoLink);

  const init = (await jsonOrThrow(
    "TikTok",
    await fetch("https://open.tiktokapis.com/v2/post/publish/video/init/", {
      method: "POST",
      headers: {
        authorization: `Bearer ${conn.accessToken}`,
        "content-type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({
        post_info: {
          title: textFor(item, 150),
          privacy_level: "SELF_ONLY",
          disable_comment: false,
        },
        source_info: {
          source: "FILE_UPLOAD",
          video_size: payload.byteLength,
          chunk_size: payload.byteLength,
          total_chunk_count: 1,
        },
      }),
    }),
  )) as unknown as { data?: { publish_id?: string; upload_url?: string } };

  const uploadUrl = init.data?.upload_url;
  if (!uploadUrl) throw new Error("TikTok did not return an upload URL.");

  const upload = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "content-type": "video/mp4",
      "content-range": `bytes 0-${payload.byteLength - 1}/${payload.byteLength}`,
    },
    body: payload,
  });
  if (!upload.ok) throw new Error(`TikTok upload failed [${upload.status}]`);

  return { channel: "TikTok", ok: true, externalId: init.data?.publish_id ?? "" };
}

/* ---------------------------------- Website ---------------------------------- */

async function publishWebsite(
  admin: Admin,
  conn: LiveConnection,
  item: PublishItem,
): Promise<PublishResult> {
  const endpoint = conn.meta["url"] as string;
  if (!endpoint) throw new Error("No website endpoint configured.");

  const body = JSON.stringify({
    id: item.id,
    type: item.type,
    title: item.title,
    summary: item.summary ?? "",
    body: item.body ?? "",
    hashtags: item.hashtags ?? "",
    image_url: await signed(admin, item.image_url),
    published_at: new Date().toISOString(),
  });

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(conn.accessToken || "LOVIZA123"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBytes = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)),
  );
  const signature = Array.from(sigBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", "x-LOVIZA123-signature": signature },
    body,
  });
  if (!res.ok) throw new Error(`Website endpoint returned ${res.status}: ${await res.text()}`);

  return { channel: "Website", ok: true, externalUrl: endpoint };
}

/* --------------------------------- Dispatcher -------------------------------- */

type Publisher = (admin: Admin, conn: LiveConnection, item: PublishItem) => Promise<PublishResult>;

const PUBLISHERS: Record<string, Publisher> = {
  LinkedIn: publishLinkedIn,
  YouTube: publishYouTube,
  Facebook: publishFacebook,
  Instagram: publishInstagram,
  X: publishX,
  Pinterest: publishPinterest,
  TikTok: publishTikTok,
  Website: publishWebsite,
};

/** Channels with no public write API — recorded so the calendar stays accurate. */
const MANUAL_CHANNELS = new Set(["Quora", "Medium"]);

export async function publishToChannel(
  admin: Admin,
  userId: string,
  channel: string,
  item: PublishItem,
): Promise<PublishResult> {
  if (MANUAL_CHANNELS.has(channel)) {
    return { channel, ok: true, manual: true };
  }
  const publisher = PUBLISHERS[channel];
  if (!publisher) return { channel, ok: false, error: `${channel} is not supported yet.` };

  const conn = await liveConnection(admin, userId, channel);
  if (!conn?.accessToken) {
    return { channel, ok: false, error: `${channel} is not connected — connect it in Brand Profile.` };
  }

  try {
    return await publisher(admin, conn, item);
  } catch (error) {
    return { channel, ok: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}
