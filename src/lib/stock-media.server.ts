/**
 * Stock footage and photos from Pixabay, chosen from the scene's idea (which the script writer derives
 * from the brand profile and its positioning message). Server-only.
 *
 * Rules followed (Pixabay API + Terms): clips are downloaded into OUR storage and kept per brand in the
 * brand media library (never shared across brands), search results are cached 24 h, safe-search is on,
 * calls are capped per day, and nothing systematic or bulk is done.
 *
 * Env:  PIXABAY_API_KEY   (required, server-side only)
 *       STOCK_MEDIA       on (default) | off
 *       STOCK_PHOTOS      on (default) | off   — try a free Pixabay photo before paying for a fal image
 *       PIXABAY_DAILY_CALL_CAP   default 80
 * Every function returns null on any problem so the caller simply falls back (never throws).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { extractTags, findMatch } from "@/lib/media-library.server";

type Admin = SupabaseClient<never, never, never>;

const key = () => process.env["PIXABAY_API_KEY"]?.trim() || "";
export const stockEnabled = () => Boolean(key()) && (process.env["STOCK_MEDIA"] ?? "on").trim().toLowerCase() !== "off";
const photosEnabled = () => stockEnabled() && (process.env["STOCK_PHOTOS"] ?? "on").trim().toLowerCase() !== "off";

const STOP = new Set("the and for with that this from your you are our into over under about a an of in on at to is it as by or be shot scene video clip footage showing shows show real natural people person someone ways way new old vs versus better best why need needs today journey start step steps make made get".split(" "));
const BAD_TAGS = ["logo", "brand", "trademark", "advertising", "nsfw"];

/** Short, plain search phrase from a scene idea. */
export function queryFrom(idea: string, maxWords = 4): string {
  const words = idea
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
  return [...new Set(words)].slice(0, maxWords).join(" ");
}

const cache = new Map<string, { at: number; data: unknown }>();

async function pixabay(path: "" | "videos/", params: Record<string, string>): Promise<{ hits?: Array<Record<string, unknown>> } | null> {
  const k = key();
  if (!k) return null;
  const url = new URL(`https://pixabay.com/api/${path}`);
  Object.entries({ ...params, key: k }).forEach(([a, b]) => url.searchParams.set(a, b));
  const cacheKey = url.toString().replace(k, "");
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < 24 * 3_600_000) return hit.data as never; // Pixabay asks for 24 h caching
  try {
    const { spendGuard, recordSpend } = await import("@/lib/spend-guard.server");
    await spendGuard("pixabay_call");
    const res = await fetch(url);
    await recordSpend("pixabay_call");
    if (!res.ok) {
      console.error(`[stock] Pixabay ${res.status}`);
      return null;
    }
    const data = (await res.json()) as { hits?: Array<Record<string, unknown>> };
    cache.set(cacheKey, { at: Date.now(), data });
    return data;
  } catch (error) {
    console.error("[stock] Pixabay request failed", error);
    return null;
  }
}

const tagList = (h: Record<string, unknown>) =>
  String(h["tags"] ?? "")
    .toLowerCase()
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

function overlap(h: Record<string, unknown>, q: string): number {
  const words = q.split(" ").filter(Boolean);
  const tags = tagList(h).join(" ");
  return words.filter((w) => tags.includes(w)).length;
}

export interface StockClip {
  url: string; // signed URL Shotstack can fetch
  path: string; // storage path (in our bucket)
  reused: boolean;
}

/**
 * A short vertical-friendly clip for a scene. Looks in this brand's library first; otherwise searches
 * Pixabay, downloads one clip into storage and records it (with source and author) in the library.
 */
export async function stockVideo(
  admin: Admin,
  ctx: { userId: string; brandId: string | null; idea: string; exclude?: Set<string> },
): Promise<StockClip | null> {
  if (!stockEnabled() || !ctx.idea.trim()) return null;
  const a = admin as unknown as SupabaseClient;
  const bucket = admin.storage.from("content-media");
  const sign = async (path: string) => (await bucket.createSignedUrl(path, 60 * 60 * 6)).data?.signedUrl ?? null;
  try {
    const tags = extractTags(ctx.idea);
    const stored = await findMatch(admin, { userId: ctx.userId, brandId: ctx.brandId, kind: "broll", aspect: "any", text: ctx.idea }, tags);
    if (stored && !ctx.exclude?.has(stored.storage_path)) {
      const url = await sign(stored.storage_path);
      if (url) {
        await a.from("brand_media").update({ used_count: (stored.used_count ?? 1) + 1, last_used_at: new Date().toISOString() }).eq("id", stored.id);
        ctx.exclude?.add(stored.storage_path);
        console.log(`[stock] reused clip ${stored.storage_path}`);
        return { url, path: stored.storage_path, reused: true };
      }
    }

    let q = queryFrom(ctx.idea, 4);
    if (!q) return null;
    let data = await pixabay("videos/", { q: q.slice(0, 100), video_type: "film", safesearch: "true", per_page: "20", min_height: "720" });
    if (!data?.hits?.length && q.split(" ").length > 2) {
      q = q.split(" ").slice(0, 2).join(" ");
      data = await pixabay("videos/", { q, video_type: "film", safesearch: "true", per_page: "20", min_height: "720" });
    }
    const candidates = (data?.hits ?? [])
      .filter((h) => {
        const dur = Number(h["duration"]);
        const tg = tagList(h);
        return dur >= 5 && dur <= 30 && !BAD_TAGS.some((b) => tg.includes(b));
      })
      .filter((h) => !ctx.exclude?.has(`library/${ctx.userId}/${ctx.brandId ?? "none"}/broll-${h["id"]}.mp4`))
      .map((h) => {
        const v = h["videos"] as Record<string, { url?: string; width?: number; height?: number; size?: number }> | undefined;
        const file = v?.["small"]?.url ? v["small"] : v?.["medium"]?.url ? v["medium"] : null;
        const ov = overlap(h, q);
        return { h, file, ov, score: ov * 2 + (file && (file.height ?? 0) > (file.width ?? 0) ? 3 : 0) };
      })
      // the clip must match the idea by its own tags; a vertical shape alone is never enough
      .filter((c) => c.file?.url && c.ov >= 1 && (c.file.size ?? 0) < 30_000_000)
      .sort((x, y) => y.score - x.score);
    const best = candidates[0];
    if (!best?.file?.url) return null;

    const res = await fetch(best.file.url);
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length > 30_000_000) return null;
    const path = `library/${ctx.userId}/${ctx.brandId ?? "none"}/broll-${best.h["id"]}.mp4`;
    const up = await bucket.upload(path, bytes, { contentType: "video/mp4", upsert: true });
    if (up.error) return null;
    await a.from("brand_media").upsert(
      {
        user_id: ctx.userId,
        brand_id: ctx.brandId,
        kind: "broll",
        aspect: "any",
        storage_path: path,
        prompt: ctx.idea.slice(0, 500),
        tags: extractTags(`${ctx.idea} ${tagList(best.h).join(" ")}`),
        source: "pixabay",
        source_url: String(best.h["pageURL"] ?? ""),
        author: String(best.h["user"] ?? ""),
        duration_s: Number(best.h["duration"]) || null,
      },
      { onConflict: "storage_path" },
    );
    ctx.exclude?.add(path);
    const url = await sign(path);
    return url ? { url, path, reused: false } : null;
  } catch (error) {
    console.error("[stock] video lookup failed", error);
    return null;
  }
}

/** A free vertical Pixabay photo for a photo layout (null → the caller pays for a fal image instead). */
export async function stockPhotoBytes(idea: string): Promise<Uint8Array | null> {
  if (!photosEnabled() || !idea.trim()) return null;
  try {
    const q = queryFrom(idea, 4);
    if (!q) return null;
    const data = await pixabay("", { q, image_type: "photo", orientation: "vertical", safesearch: "true", per_page: "20", min_height: "1000" });
    const best = (data?.hits ?? [])
      .filter((h) => !BAD_TAGS.some((b) => tagList(h).includes(b)) && overlap(h, q) > 0)
      .sort((x, y) => overlap(y, q) - overlap(x, q))[0];
    const url = best ? String(best["largeImageURL"] ?? best["webformatURL"] ?? "") : "";
    if (!url) return null;
    const res = await fetch(url);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch (error) {
    console.error("[stock] photo lookup failed", error);
    return null;
  }
}
