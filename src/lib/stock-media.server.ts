/**
 * Stock footage and photos from Pixabay, chosen from the scene's idea (which the script writer derives
 * from the brand profile and its positioning message). Server-only.
 *
 * Rules followed (Pixabay API + Terms): clips are downloaded into OUR storage and kept per brand in the
 * brand media library (never shared across brands), search results are cached 24 h, safe-search is on,
 * calls are capped per day, and nothing systematic or bulk is done.
 *
 * Sources: Pixabay and Pexels (both free, with API keys). Each is searched live for the scene; the best
 * match across both is downloaded into the brand's own library and reused, so the library grows with use.
 *
 * Env:  PIXABAY_API_KEY   (server-side only)
 *       PEXELS_API_KEY    (server-side only; adds Pexels as a second source)
 *       PEXELS_DAILY_CALL_CAP    default 150
 *       STOCK_MEDIA       on (default) | off
 *       STOCK_PHOTOS      on (default) | off   — try a free Pixabay photo before paying for a fal image
 *       PIXABAY_DAILY_CALL_CAP   default 80
 * Every function returns null on any problem so the caller simply falls back (never throws).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { extractTags, findMatch } from "@/lib/media-library.server";

type Admin = SupabaseClient<never, never, never>;

const key = () => process.env["PIXABAY_API_KEY"]?.trim() || "";
const pexelsKey = () => process.env["PEXELS_API_KEY"]?.trim() || "";
export const stockEnabled = () => (Boolean(key()) || Boolean(pexelsKey())) && (process.env["STOCK_MEDIA"] ?? "on").trim().toLowerCase() !== "off";
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


interface PexelsVideo {
  id: number;
  url?: string;
  duration?: number;
  user?: { name?: string };
  video_files?: Array<{ quality?: string; file_type?: string; width?: number; height?: number; link?: string }>;
}

async function pexelsVideos(q: string): Promise<PexelsVideo[]> {
  const k = pexelsKey();
  if (!k) return [];
  const url = new URL("https://api.pexels.com/videos/search");
  url.search = new URLSearchParams({ query: q, orientation: "portrait", size: "medium", per_page: "20" }).toString();
  const ck = url.toString();
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.at < 24 * 3_600_000) return hit.data as PexelsVideo[];
  try {
    const { spendGuard, recordSpend } = await import("@/lib/spend-guard.server");
    await spendGuard("pexels_call");
    await recordSpend("pexels_call");
    const res = await fetch(ck, { headers: { Authorization: k } });
    if (!res.ok) {
      console.error(`[stock] Pexels ${res.status}`);
      return [];
    }
    const json = (await res.json()) as { videos?: PexelsVideo[] };
    const list = json.videos ?? [];
    cache.set(ck, { at: Date.now(), data: list });
    return list;
  } catch (error) {
    console.error("[stock] Pexels request failed", error);
    return [];
  }
}

/** Words in a Pexels page URL slug ("man-typing-on-a-laptop-3129957"), the only text Pexels gives for a clip. */
const slugWords = (u: string) => String(u).replace(/\/+$/, "").split("/").pop()?.replace(/-\d+$/, "").split("-").filter(Boolean) ?? [];

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
    type Cand = { id: string; url: string; score: number; page: string; author: string; duration: number; tags: string };
    const gather = async (query: string): Promise<Cand[]> => {
      const out: Cand[] = [];
      const need = Math.min(2, query.split(" ").filter(Boolean).length);
      const data = await pixabay("videos/", { q: query.slice(0, 100), video_type: "film", safesearch: "true", per_page: "20", min_height: "720" });
      for (const h of data?.hits ?? []) {
        const dur = Number(h["duration"]);
        const tg = tagList(h);
        if (!(dur >= 5 && dur <= 30) || BAD_TAGS.some((b) => tg.includes(b))) continue;
        const id = `${h["id"]}`;
        if (ctx.exclude?.has(`library/${ctx.userId}/${ctx.brandId ?? "none"}/broll-${id}.mp4`)) continue;
        const v = h["videos"] as Record<string, { url?: string; width?: number; height?: number; size?: number }> | undefined;
        const file = v?.["small"]?.url ? v["small"] : v?.["medium"]?.url ? v["medium"] : null;
        const ov = overlap(h, query);
        if (!file?.url || ov < need || (file.size ?? 0) >= 30_000_000) continue;
        out.push({ id, url: file.url, score: ov * 2 + ((file.height ?? 0) > (file.width ?? 0) ? 3 : 0), page: String(h["pageURL"] ?? ""), author: String(h["user"] ?? ""), duration: dur, tags: tg.join(" ") });
      }
      const words = query.split(" ").filter(Boolean);
      (await pexelsVideos(query)).forEach((v, rank) => {
        const dur = Number(v.duration);
        const id = `pexels-${v.id}`;
        if (!(dur >= 5 && dur <= 30) || ctx.exclude?.has(`library/${ctx.userId}/${ctx.brandId ?? "none"}/broll-${id}.mp4`)) return;
        const slug = slugWords(v.url ?? "");
        const ov = words.filter((w) => slug.some((sw) => sw.includes(w) || w.includes(sw))).length;
        const files = (v.video_files ?? []).filter((f) => f.file_type === "video/mp4" && f.link && (f.height ?? 0) > (f.width ?? 0) && (f.width ?? 0) <= 1080);
        const file = files.sort((x, y) => (y.height ?? 0) - (x.height ?? 0))[0];
        if (!file?.link || ov < 1) return;
        // Pexels ranks by relevance already; an earlier hit gets a small bonus
        out.push({ id, url: file.link, score: ov * 2 + 3 + Math.max(0, 3 - rank * 0.3), page: v.url ?? "", author: v.user?.name ?? "", duration: dur, tags: slug.join(" ") });
      });
      return out.sort((x, y) => y.score - x.score);
    };
    let found = await gather(q);
    if (!found.length && q.split(" ").length > 2) {
      q = q.split(" ").slice(0, 2).join(" ");
      found = await gather(q);
    }
    const best = found[0];
    if (!best) return null;

    const res = await fetch(best.url);
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length > 30_000_000) return null;
    const path = `library/${ctx.userId}/${ctx.brandId ?? "none"}/broll-${best.id}.mp4`;
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
        tags: extractTags(`${ctx.idea} ${best.tags}`),
        source: best.id.startsWith("pexels-") ? "pexels" : "pixabay",
        source_url: best.page,
        author: best.author,
        duration_s: best.duration || null,
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

const IMG_FILE = /\.(png|jpe?g|webp)$/i;
const hashOf = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

/**
 * One of the brand's OWN uploaded images (hero product photos first, then Brand Assets images) for a
 * photo scene, so reels and posters show the real product and place instead of stock. Photos rotate
 * by seed and never repeat within one video (`used`). Returns null when the brand has none.
 */
export async function brandPhotoBytes(
  admin: Admin,
  ctx: { userId: string; brandId: string | null; seed: string; used: Set<string> },
): Promise<Uint8Array | null> {
  if (!ctx.brandId) return null;
  try {
    const bucket = admin.storage.from("content-media");
    const root = `${ctx.userId}/brand/${ctx.brandId}`;
    const names = async (folder: string) =>
      ((await bucket.list(`${root}/${folder}`, { limit: 100 })).data ?? []).filter((f) => f.name && IMG_FILE.test(f.name)).map((f) => `${root}/${folder}/${f.name}`);
    const all = [...(await names("products")), ...(await names("assets"))].filter((p) => !ctx.used.has(p));
    if (!all.length) return null;
    const pick = all[hashOf(ctx.seed) % all.length]!;
    const file = await bucket.download(pick);
    if (file.error || !file.data) return null;
    ctx.used.add(pick);
    return new Uint8Array(await file.data.arrayBuffer());
  } catch (error) {
    console.error("[stock] brand photo lookup failed", error);
    return null;
  }
}

/**
 * Right after the Brand Profile or Brand Brain changes: fetch a small, relevant set of clips for the
 * brand's own filmable subjects (from its playbook) into its library, so reels do not wait on a search
 * and find a match ready. Deliberately modest (default 8 per run, none once the library holds 30) and
 * reuses what is already stored. Returns how many new clips were saved.
 */
export async function prefetchFootage(
  admin: Admin,
  ctx: { userId: string; brandId: string; subjects: string[] },
): Promise<number> {
  if (!stockEnabled()) return 0;
  const max = Math.max(0, Math.min(15, Number(process.env["FOOTAGE_PREFETCH_MAX"] ?? 8) || 8));
  if (!max) return 0;
  try {
    const a = admin as unknown as SupabaseClient;
    const { count } = await a.from("brand_media").select("id", { count: "exact", head: true }).eq("brand_id", ctx.brandId).eq("kind", "broll");
    if ((count ?? 0) >= 30) return 0;
    const started = Date.now();
    const used = new Set<string>();
    let saved = 0;
    for (const subject of ctx.subjects.slice(0, max)) {
      if (Date.now() - started > 40_000) break;
      const clip = await stockVideo(admin, { userId: ctx.userId, brandId: ctx.brandId, idea: subject, exclude: used });
      if (clip && !clip.reused) saved += 1;
    }
    console.log(`[stock] prefetched ${saved} clip(s) for brand ${ctx.brandId}`);
    return saved;
  } catch (error) {
    console.error("[stock] footage prefetch failed", error);
    return 0;
  }
}
