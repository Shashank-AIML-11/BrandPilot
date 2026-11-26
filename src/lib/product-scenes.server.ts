/**
 * Product scenes. Server-only.
 *
 * Takes the brand's own product photos (Brand Profile > hero product photos) and has fal's
 * image-edit model put the SAME product into a fresh setting (lifestyle, flat-lay, studio,
 * seasonal ...). Results are kept per (product, style, shape) so each combination is paid for
 * once and then reused, while new combinations rotate in so a feed does not repeat itself.
 *
 *   PRODUCT_SCENES          on (default) | off
 *   PRODUCT_SCENE_SHARE     % of photos that use a product scene when the brand has product photos (default 50)
 *   PRODUCT_SCENE_NEW_SHARE % of those that may create a NEW combination instead of reusing one (default 50)
 *   FAL_EDIT_MODEL          default fal-ai/nano-banana/edit
 *
 * Every new picture counts towards the daily image limit (FAL_DAILY_IMAGE_CAP). Fails soft:
 * with no product photos, the switch off, or any error, it returns null and the caller
 * carries on exactly as before.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type Admin = SupabaseClient<any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const SCENE_STYLES: Array<{ id: string; scene: string }> = [
  { id: "lifestyle_in_use", scene: "a bright, natural lifestyle moment where an everyday customer is using it, shallow depth of field, warm daylight" },
  { id: "flat_lay", scene: "a tidy top-down flat-lay on a soft neutral surface with a few simple props that fit the product, even soft light" },
  { id: "studio_clean", scene: "a clean studio shot on a seamless light backdrop with a soft shadow, crisp and premium" },
  { id: "bold_colour", scene: "a bold single-colour backdrop with strong, graphic lighting and lots of clean empty space" },
  { id: "cafe_table", scene: "a cosy table in a warm cafe or home setting, natural window light, slightly blurred background" },
  { id: "outdoor_natural", scene: "an outdoor setting with natural greenery and golden-hour light, relaxed and fresh" },
  { id: "pedestal_minimal", scene: "a minimal stone pedestal or podium with a soft gradient wall behind it, elegant and uncluttered" },
  { id: "workspace_desk", scene: "a tidy modern desk or workspace, natural light, a couple of neutral props, productive mood" },
  { id: "festive_warm", scene: "a warm festive setting with soft glowing lights and tasteful seasonal touches, joyful but not cluttered" },
  { id: "hands_holding", scene: "hands holding or presenting it toward the camera, friendly and personal, soft background" },
];

const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const IMG = /\.(png|jpe?g|webp)$/i;

/** What each product-scene decision was in this run; the worker returns it so it can be read without server logs. */
export const sceneNotes: string[] = [];
const note = (message: string, error?: unknown) => {
  sceneNotes.push(error ? `${message}: ${error instanceof Error ? error.message : String(error)}`.slice(0, 300) : message);
  if (sceneNotes.length > 30) sceneNotes.shift();
  if (error) console.error(message, error);
  else console.log(message);
};

export function productScenesEnabled(): boolean {
  return (process.env["PRODUCT_SCENES"] ?? "on").trim().toLowerCase() !== "off" && Boolean(process.env["FAL_KEY"]?.trim());
}

const pct = (name: string, fallback: number) => {
  const n = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : fallback;
};

async function listNames(admin: Admin, folder: string): Promise<string[]> {
  const { data } = await admin.storage.from("content-media").list(folder, { limit: 200 });
  return (data ?? []).map((f) => f.name).filter((n) => n && !n.startsWith("."));
}

async function editWithFal(imageUrl: string, scene: string, aspect: string): Promise<Uint8Array> {
  const apiKey = process.env["FAL_KEY"]!.trim();
  const model = (process.env["FAL_EDIT_MODEL"] ?? "fal-ai/nano-banana/edit").trim();
  const { spendGuard, recordSpend } = await import("@/lib/spend-guard.server");
  await spendGuard("fal_image");
  const prompt =
    `Keep the product in the supplied photo EXACTLY as it is: same shape, colours, materials, labels and logo, nothing added to or removed from the product itself. ` +
    `Place it in this new setting: ${scene}. Photorealistic commercial photograph, the product is the clear focal point. ` +
    `No text, captions, watermarks or extra logos anywhere in the picture.`;
  const call = (body: Record<string, unknown>) =>
    fetch(`https://fal.run/${model}`, {
      method: "POST",
      headers: { Authorization: `Key ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ ...body, enable_safety_checker: true }),
    });
  let res = await call({ prompt, image_urls: [imageUrl], num_images: 1, aspect_ratio: aspect });
  if (res.status === 422) res = await call({ prompt, image_urls: [imageUrl], num_images: 1 }); // model without aspect_ratio
  if (!res.ok) throw new Error(`fal.ai image edit failed [${res.status}]: ${(await res.text().catch(() => "")).slice(0, 300)}`);
  await recordSpend("fal_image");
  const json = (await res.json()) as { images?: Array<{ url?: string }> };
  const url = json.images?.[0]?.url;
  if (!url) throw new Error("fal.ai did not return an edited image.");
  const img = await fetch(url);
  if (!img.ok) throw new Error(`Could not download the edited image [${img.status}]`);
  return new Uint8Array(await img.arrayBuffer());
}

/** A scene picture built from one of the brand's own product photos, or null to use the normal image path. */
export async function productSceneFor(
  admin: Admin,
  ctx: { userId: string; brandId: string | null | undefined; aspect: string; seed: string },
): Promise<Uint8Array | null> {
  note(`[scene] checking ${ctx.aspect} (brand ${ctx.brandId ?? "none"})`);
  try {
    if (!productScenesEnabled() || !ctx.brandId) {
      note(`[scene] skipped: ${!ctx.brandId ? "no brand id on the post" : "switched off or FAL_KEY missing"}`);
      return null;
    }
    if (hash(`${ctx.seed}|share`) % 100 >= pct("PRODUCT_SCENE_SHARE", 50)) {
      note("[scene] skipped: this post did not draw a product scene (PRODUCT_SCENE_SHARE)");
      return null;
    }

    const root = `${ctx.userId}/brand/${ctx.brandId}`;
    const products = (await listNames(admin, `${root}/products`)).filter((n) => IMG.test(n));
    if (!products.length) {
      note(`[scene] skipped: no product photos found in ${root}/products`);
      return null;
    }

    const shape = ctx.aspect.replace(":", "x");
    const sceneFolder = `${root}/scenes`;
    const existing = (await listNames(admin, sceneFolder)).filter((n) => n.endsWith(`__${shape}.png`));
    const key = (p: string) => p.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9]+/g, "-").slice(0, 40);
    const fileFor = (p: string, styleId: string) => `${key(p)}__${styleId}__${shape}.png`;

    const unmade: Array<{ product: string; style: (typeof SCENE_STYLES)[number] }> = [];
    for (const p of products) for (const st of SCENE_STYLES) if (!existing.includes(fileFor(p, st.id))) unmade.push({ product: p, style: st });

    const wantsNew = unmade.length > 0 && (existing.length === 0 || hash(`${ctx.seed}|new`) % 100 < pct("PRODUCT_SCENE_NEW_SHARE", 50));

    if (wantsNew) {
      // Least-used product first, then least-used style, so photos and looks both rotate.
      const used = (needle: string) => existing.filter((n) => n.includes(needle)).length;
      const ranked = [...unmade].sort(
        (a, b) => used(key(a.product)) - used(key(b.product)) || used(`__${a.style.id}__`) - used(`__${b.style.id}__`) || hash(ctx.seed + a.style.id) - hash(ctx.seed + b.style.id),
      );
      const pick = ranked[0]!;
      try {
        const { data: signed } = await admin.storage.from("content-media").createSignedUrl(`${root}/products/${pick.product}`, 600);
        if (!signed?.signedUrl) throw new Error("Could not read the product photo.");
        const bytes = await editWithFal(signed.signedUrl, pick.style.scene, ctx.aspect);
        await admin.storage.from("content-media").upload(`${sceneFolder}/${fileFor(pick.product, pick.style.id)}`, bytes, { contentType: "image/png", upsert: true });
        note(`[scene] new product scene: ${pick.product} / ${pick.style.id} / ${shape}`);
        return bytes;
      } catch (error) {
        note("[scene] could not make a new product scene, trying a saved one", error);
        if (!existing.length) return null;
      }
    }

    if (!existing.length) return null;
    const chosen = existing[hash(ctx.seed) % existing.length]!;
    const file = await admin.storage.from("content-media").download(`${sceneFolder}/${chosen}`);
    if (file.error || !file.data) return null;
    note(`[scene] reused product scene ${chosen} - no image cost`);
    return new Uint8Array(await file.data.arrayBuffer());
  } catch (error) {
    note("[scene] product scenes unavailable, using the normal image path", error);
    return null;
  }
}
