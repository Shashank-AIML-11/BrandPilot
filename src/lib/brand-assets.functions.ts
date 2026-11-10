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
