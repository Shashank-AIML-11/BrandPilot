import { supabase } from "@/integrations/supabase/client";

const cache = new Map<string, string>();

/** Synchronous read of an already-signed URL — lets dialogs paint instantly. */
export function cachedMediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return cache.get(path) ?? null;
}

export async function signedMediaUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const cached = cache.get(path);
  if (cached) return cached;
  const { data } = await supabase.storage.from("content-media").createSignedUrl(path, 3600);
  if (!data?.signedUrl) return null;
  cache.set(path, data.signedUrl);
  return data.signedUrl;
}

/** Signs every media path for a month up front so opening a day is instant. */
export async function prefetchMediaUrls(paths: Array<string | null | undefined>): Promise<void> {
  const pending = Array.from(
    new Set(
      paths.filter((p): p is string => Boolean(p) && !p!.startsWith("http") && !cache.has(p!)),
    ),
  );
  if (!pending.length) return;

  for (let i = 0; i < pending.length; i += 100) {
    const batch = pending.slice(i, i + 100);
    const { data } = await supabase.storage.from("content-media").createSignedUrls(batch, 3600);
    (data ?? []).forEach((entry) => {
      if (entry.path && entry.signedUrl) cache.set(entry.path, entry.signedUrl);
    });
  }
}
