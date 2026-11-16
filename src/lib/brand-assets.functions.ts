import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/svg+xml": "svg" };
const MAX_BYTES = 1_500_000;

export const uploadBrandLogo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { brandId?: string; mime: string; base64: string }) => input)
  .handler(async ({ data, context }) => {
    const ext = TYPES[data.mime];
    if (!ext) throw new Error("Logo must be a PNG, JPG or SVG file.");
    const bytes = Buffer.from(data.base64, "base64");
    if (!bytes.length || bytes.length > MAX_BYTES) throw new Error("Logo must be smaller than 1.5 MB.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadBrand } = await import("@/lib/brand.server");
    const brand = await loadBrand(supabaseAdmin as never, context.userId, data.brandId ?? null);
    if (!brand) throw new Error("Save your Brand Profile once, then upload the logo.");

    const path = `${context.userId}/brand/${brand.id}-logo.${ext}`;
    const { error } = await supabaseAdmin.storage
      .from("content-media")
      .upload(path, bytes, { contentType: data.mime, upsert: true });
    if (error) throw new Error(error.message);
    const { error: updateError } = await supabaseAdmin
      .from("brand_profiles")
      .update({ logo_url: path } as never)
      .eq("id", brand.id);
    if (updateError) throw new Error(updateError.message);
    return { path };
  });

export const removeBrandLogo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { brandId?: string }) => input ?? {})
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadBrand } = await import("@/lib/brand.server");
    const brand = await loadBrand(supabaseAdmin as never, context.userId, data.brandId ?? null);
    if (!brand) return { ok: true };
    const path = (brand as { logo_url?: string }).logo_url;
    if (path) await supabaseAdmin.storage.from("content-media").remove([path]);
    await supabaseAdmin.from("brand_profiles").update({ logo_url: "" } as never).eq("id", brand.id);
    return { ok: true };
  });

export const getBrandLogoUrl = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { path: string }) => input)
  .handler(async ({ data, context }) => {
    // Only paths inside the caller's own folder can be signed.
    if (!data.path || !data.path.startsWith(`${context.userId}/brand/`)) return { url: null };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed } = await supabaseAdmin.storage
      .from("content-media")
      .createSignedUrl(data.path, 60 * 60);
    return { url: signed?.signedUrl ?? null };
  });

/* ---------- Extra brand assets (any number of images / PDFs, separate from the logo) ---------- */

const ASSET_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/svg+xml": "svg",
  "image/webp": "webp",
  "application/pdf": "pdf",
};
const ASSET_MAX_BYTES = 3_000_000;
const ASSET_MAX_COUNT = 20;

export interface BrandAsset {
  path: string;
  name: string;
  mime: string;
  url: string | null;
}

function mimeFromName(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  return (
    Object.entries(ASSET_TYPES).find(([, e]) => e === ext)?.[0] ?? "application/octet-stream"
  );
}

async function assetFolder(userId: string, brandId: string | null | undefined) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { loadBrand } = await import("@/lib/brand.server");
  const brand = await loadBrand(supabaseAdmin as never, userId, brandId ?? null);
  if (!brand) throw new Error("Save your Brand Profile once, then upload brand assets.");
  return { supabaseAdmin, folder: `${userId}/brand/${brand.id}/assets` };
}

export const listBrandAssets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { brandId?: string }) => input ?? {})
  .handler(async ({ data, context }): Promise<{ assets: BrandAsset[] }> => {
    let ctx;
    try {
      ctx = await assetFolder(context.userId, data.brandId);
    } catch {
      return { assets: [] };
    }
    const { supabaseAdmin, folder } = ctx;
    const { data: files } = await supabaseAdmin.storage
      .from("content-media")
      .list(folder, { limit: 100, sortBy: { column: "created_at", order: "desc" } });
    const names = (files ?? []).filter((f) => f.name && !f.name.startsWith("."));
    if (!names.length) return { assets: [] };
    const paths = names.map((f) => `${folder}/${f.name}`);
    const { data: signed } = await supabaseAdmin.storage
      .from("content-media")
      .createSignedUrls(paths, 60 * 60);
    return {
      assets: names.map((f, i) => ({
        path: paths[i]!,
        name: f.name.replace(/^\d+-/, ""),
        mime: mimeFromName(f.name),
        url: signed?.[i]?.signedUrl ?? null,
      })),
    };
  });

export const uploadBrandAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { brandId?: string; name: string; mime: string; base64: string; replacePath?: string }) =>
      input,
  )
  .handler(async ({ data, context }) => {
    const ext = ASSET_TYPES[data.mime];
    if (!ext) throw new Error("Brand assets must be PNG, JPG, SVG, WebP or PDF files.");
    const bytes = Buffer.from(data.base64, "base64");
    if (!bytes.length || bytes.length > ASSET_MAX_BYTES)
      throw new Error("Each brand asset must be smaller than 3 MB.");

    const { supabaseAdmin, folder } = await assetFolder(context.userId, data.brandId);

    if (!data.replacePath) {
      const { data: existing } = await supabaseAdmin.storage
        .from("content-media")
        .list(folder, { limit: ASSET_MAX_COUNT + 1 });
      if ((existing ?? []).length >= ASSET_MAX_COUNT)
        throw new Error(`You can keep up to ${ASSET_MAX_COUNT} brand assets. Delete one first.`);
    }

    const base = (data.name || "asset").replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]+/g, "-");
    const path = `${folder}/${Date.now()}-${base.slice(0, 60) || "asset"}.${ext}`;
    const { error } = await supabaseAdmin.storage
      .from("content-media")
      .upload(path, bytes, { contentType: data.mime, upsert: false });
    if (error) throw new Error(error.message);

    // Replace: drop the old file only after the new one is safely stored.
    if (data.replacePath && data.replacePath.startsWith(`${folder}/`)) {
      await supabaseAdmin.storage.from("content-media").remove([data.replacePath]);
    }
    return { path };
  });

export const removeBrandAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { brandId?: string; path: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, folder } = await assetFolder(context.userId, data.brandId);
    if (!data.path.startsWith(`${folder}/`)) throw new Error("Not your file.");
    await supabaseAdmin.storage.from("content-media").remove([data.path]);
    return { ok: true };
  });
