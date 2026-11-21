/**
 * Brand media library. Every photo / illustration made by the image provider is stored here,
 * and later generations look for a matching one first, so fal is only paid when nothing fits.
 * Server-only. Never throws because of the library itself: any library problem simply means
 * "generate a new image" (and the error is logged).
 *
 * Env (all optional):
 *   MEDIA_REUSE                    on (default) | off  — off = always generate (still stores)
 *   MEDIA_REUSE_MIN_MATCH_PHOTO    shared keywords needed to reuse a photo        default 3
 *   MEDIA_REUSE_MIN_MATCH_ART      shared keywords needed to reuse an illustration default 2
 *   MEDIA_REUSE_COOLDOWN_DAYS      do not reuse an image used in the last N days   default 6
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type Admin = SupabaseClient<never, never, never>;

export type MediaKind = "photo" | "art";

export interface MediaContext {
  userId: string;
  brandId: string | null;
  kind: MediaKind;
  /** The text that describes the image (prompt, title, object idea). Keywords are taken from it. */
  text: string;
  aspect: string;
}

export interface MediaResult {
  bytes: Uint8Array;
  path: string | null;
  reused: boolean;
}

const STOP = new Set(
  "the and for with that this from your you are our into over under about more most just than then them they their have has had was were will can could would should not but all any one two three four five six very real natural light photo photograph image picture shot vertical horizontal composition style candid documentary people person place scene background space empty lower third text letters logos logo word words brand".split(
    " ",
  ),
);

export function extractTags(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP.has(w));
  return [...new Set(words)].slice(0, 14);
}

const envNum = (name: string, fallback: number) => {
  const n = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

async function findMatch(admin: Admin, ctx: MediaContext, tags: string[]) {
  if ((process.env["MEDIA_REUSE"] ?? "on").trim().toLowerCase() === "off" || tags.length === 0) return null;
  const a = admin as unknown as SupabaseClient;
  let q = a
    .from("brand_media")
    .select("id, storage_path, tags, used_count, last_used_at")
    .eq("user_id", ctx.userId)
    .eq("kind", ctx.kind)
    .eq("aspect", ctx.aspect)
    .order("last_used_at", { ascending: false })
    .limit(120);
  q = ctx.brandId ? q.eq("brand_id", ctx.brandId) : q.is("brand_id", null);
  const { data, error } = await q;
  if (error || !data) return null;

  const minMatch = ctx.kind === "photo" ? envNum("MEDIA_REUSE_MIN_MATCH_PHOTO", 3) : envNum("MEDIA_REUSE_MIN_MATCH_ART", 2);
  const cooldownMs = envNum("MEDIA_REUSE_COOLDOWN_DAYS", 6) * 86_400_000;
  const now = Date.now();
  let best: { row: (typeof data)[number]; score: number } | null = null;
  for (const row of data as Array<{ id: string; storage_path: string; tags: string[]; used_count: number; last_used_at: string }>) {
    if (now - new Date(row.last_used_at).getTime() < cooldownMs) continue; // keep the feed varied
    const rowTags = row.tags ?? [];
    const shared = rowTags.filter((t) => tags.includes(t)).length;
    const union = new Set([...rowTags, ...tags]).size;
    const need = Math.min(minMatch, tags.length, rowTags.length);
    if (need === 0 || shared < need || shared / union < 0.4) continue;
    const score = shared - row.used_count * 0.01;
    if (!best || score > best.score) best = { row: row as never, score };
  }
  return best?.row ?? null;
}

/**
 * Returns an image for this context: a stored one when a close match exists, otherwise a freshly
 * generated one (which is then stored for the future).
 */
export async function reuseOrGenerate(
  admin: Admin,
  ctx: MediaContext,
  generate: () => Promise<Uint8Array>,
): Promise<MediaResult> {
  const tags = extractTags(ctx.text);
  const a = admin as unknown as SupabaseClient;

  try {
    const hit = await findMatch(admin, ctx, tags);
    if (hit) {
      const file = await admin.storage.from("content-media").download(hit.storage_path);
      if (!file.error && file.data) {
        await a
          .from("brand_media")
          .update({ used_count: ((hit as { used_count?: number }).used_count ?? 1) + 1, last_used_at: new Date().toISOString() })
          .eq("id", hit.id);
        console.log(`[media] reused ${ctx.kind} (${hit.storage_path}) - no image cost`);
        return { bytes: new Uint8Array(await file.data.arrayBuffer()), path: hit.storage_path, reused: true };
      }
    }
  } catch (error) {
    console.error("[media] library lookup failed, generating instead", error);
  }

  const bytes = await generate();

  let path: string | null = null;
  try {
    const id = crypto.randomUUID();
    path = `library/${ctx.userId}/${ctx.brandId ?? "none"}/${ctx.kind}-${id}.png`;
    const up = await admin.storage.from("content-media").upload(path, bytes, { contentType: "image/png", upsert: true });
    if (up.error) {
      path = null;
    } else {
      await a.from("brand_media").insert({
        user_id: ctx.userId,
        brand_id: ctx.brandId,
        kind: ctx.kind,
        aspect: ctx.aspect,
        storage_path: path,
        prompt: ctx.text.slice(0, 500),
        tags,
      });
    }
  } catch (error) {
    console.error("[media] could not save to the library", error);
  }
  return { bytes, path, reused: false };
}
