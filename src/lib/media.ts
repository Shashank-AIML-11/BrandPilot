import { supabase } from "@/integrations/supabase/client";

const cache = new Map<string, string>();

/**
 * content-media is a PUBLIC bucket, so we build a plain public URL
 * client-side instead of requesting a signed URL. This is intentional,
 * not just a simplification: createSignedUrl() goes through Supabase
 * Storage's authenticated /object/sign/ endpoint, which enforces Storage
 * RLS policies on storage.objects REGARDLESS of the bucket's "Public"
 * flag. With zero policies configured on this bucket, every sign
 * request failed with 400 — even for files that had just uploaded
 * successfully seconds earlier (uploads succeed because video-queue.
 * server.ts uploads via the service-role admin client, which bypasses
 * RLS entirely; the frontend's anon-key client does not). That 400 is
 * what left every generated image stuck on "Preparing the visual…"
 * forever: signedMediaUrl() resolved to null on failure, and the UI has
 * no separate "failed" state, only "no URL yet".
 *
 * getPublicUrl() needs no RLS policy — it just deterministically builds
 * the bucket's public URL for a given path, entirely client-side, no
 * network round trip. If this bucket is ever changed to Private, this
 * needs to revert to createSignedUrl() AND a SELECT policy needs adding
 * in Supabase Storage → Policies for content-media.
 */
function publicUrlFor(path: string): string | null {
  const { data } = supabase.storage.from("content-media").getPublicUrl(path);
  return data?.publicUrl ?? null;
}

/** Synchronous read of an already-resolved URL — lets dialogs paint instantly. */
export function cachedMediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const cached = cache.get(path);
  if (cached) return cached;
  // getPublicUrl is a cheap local computation (no network call), so we
  // can resolve it synchronously right here instead of only returning
  // whatever was previously cached — this call path used to depend on
  // prefetchMediaUrls() having already run and populated the cache.
  const url = publicUrlFor(path);
  if (url) cache.set(path, url);
  return url;
}

/** Kept async to match existing .then(...) call sites — getPublicUrl itself
 *  is synchronous, so this just wraps cachedMediaUrl. */
export async function signedMediaUrl(path: string | null | undefined): Promise<string | null> {
  return cachedMediaUrl(path);
}

/** Warms the cache for a batch of paths up front so opening a day is instant.
 *  No network calls needed (getPublicUrl is local), kept as a function so
 *  existing call sites (e.g. calendar.tsx) don't need to change. */
export async function prefetchMediaUrls(paths: Array<string | null | undefined>): Promise<void> {
  paths.forEach((p) => {
    if (p) cachedMediaUrl(p);
  });
}
