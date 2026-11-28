/**
 * "Explainer Pro": branded explainer videos built from a library of designed scene layouts
 * (see explainer-layouts.server.ts). The AI script writer (Groq) picks a layout per scene and fills
 * in the text; fal paints at most a couple of pictures; Shotstack adds the AI voice, the animated
 * transitions and assembles everything into one MP4 from a single timeline.
 *
 * Switch on with VIDEO_PROVIDER=shotstack. Env:
 *   SHOTSTACK_API_KEY   (required)  key of the matching environment
 *   SHOTSTACK_ENV       stage (free sandbox, watermarked) | v1 (production)   default: stage
 *   SHOTSTACK_VOICE     voice name, e.g. Rachel (see Shotstack "AI speech generation" docs)
 *   EXPLAINER_ASPECT    9:16 (720x1280, default) | 4:5 (720x900)
 *   EXPLAINER_MAX_SECONDS  hard length target, default 30. The script is fitted to this many seconds of
 *                       speech (about 2.2 words per second) so no voice line is ever cut off
 *   EXPLAINER_SCENES    number of scenes, 4-6 (default 5; each scene is one voice line)
 *   EXPLAINER_IMAGES    on (default) | off   — pictures for photo/illustration layouts
 *   EXPLAINER_MAX_IMAGES  max fal/stock pictures per video (default 2)
 *   EXPLAINER_MAX_BROLL   max stock video clips (Pixabay) per video (default 3; needs PIXABAY_API_KEY)
 *   EXPLAINER_MUSIC_URL optional public mp3 link for background music
 *
 * Not live-tested against Shotstack: if it rejects a field, its exact message is shown on the video card.
 */
import { posterCopyFor, cleanColor } from "@/lib/poster.server";
import {
  LAYOUTS,
  LAYOUT_BY_ID,
  ICON_LIST,
  W,
  layoutCatalogue,
  renderScene,
  esc,
  dottedBackground,
  readableOn,
  TRANSITIONS,
  type SceneFields,
  type Theme,
} from "@/lib/explainer-layouts.server";
import { FONT_CSS } from "@/lib/explainer-font.server";

export type ExplainerScene = SceneFields & {
  imageUrl?: string | null; // picture for photo / illustration layouts
  videoUrl?: string | null; // stock clip for the broll layout
};

export interface ExplainerInput {
  userId?: string;
  brandId?: string | null;
  item: { id: string; title?: string | null; summary?: string | null; image_prompt?: string | null };
  brandName: string;
  website: string;
  colors?: { primary?: string; secondary?: string; accent?: string } | null;
  logoUrl?: string | null; // public/signed URL
  scenes?: ExplainerScene[]; // written + illustrated by prepareScenes()
  photoPrompt?: string | null;
}

const H = (process.env["EXPLAINER_ASPECT"] ?? "9:16").trim() === "4:5" ? 900 : 1280;

function base(): string {
  const env = (process.env["SHOTSTACK_ENV"] ?? "stage").trim() || "stage";
  return `https://api.shotstack.io/edit/${env}`;
}
function key(): string {
  const k = process.env["SHOTSTACK_API_KEY"]?.trim();
  if (!k) throw new Error("Video assembly is not configured (missing SHOTSTACK_API_KEY).");
  return k;
}

export function explainerEnabled(): boolean {
  return (process.env["VIDEO_PROVIDER"] ?? "").trim().toLowerCase() === "shotstack";
}

/** Plain fallback script (hook, selling points, call to action) if the AI scene writer fails. */
export function explainerPlan(input: ExplainerInput) {
  const copy = posterCopyFor(input.item, { website: input.website });
  const points = copy.points.length ? copy.points : [copy.subline].filter(Boolean);
  return { headline: copy.headline, points: points.slice(0, 3), cta: copy.cta };
}

const blank = (): SceneFields => ({ layout: "hook", voice: "", title: "", sub: "", items: [], stats: [], a: [], b: [], img: "" });

function fallbackScenes(input: ExplainerInput): ExplainerScene[] {
  const plan = explainerPlan(input);
  return [
    { ...blank(), layout: "hook", voice: plan.headline, title: plan.headline },
    ...plan.points.map((p) => ({ ...blank(), layout: "statement", voice: p, title: p })),
    { ...blank(), layout: "cta_end", voice: `${plan.cta} with ${input.brandName}`, title: plan.cta },
  ];
}

const str = { type: "string" };
const SCENE_SCHEMA = {
  type: "object",
  properties: {
    scenes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          layout: str,
          voice: str,
          title: str,
          sub: str,
          items: {
            type: "array",
            items: { type: "object", properties: { t: str, d: str, i: str }, required: ["t", "d", "i"], additionalProperties: false },
          },
          stats: {
            type: "array",
            items: { type: "object", properties: { v: str, l: str }, required: ["v", "l"], additionalProperties: false },
          },
          a: { type: "array", items: str },
          b: { type: "array", items: str },
          img: str,
        },
        required: ["layout", "voice", "title", "sub", "items", "stats", "a", "b", "img"],
        additionalProperties: false,
      },
    },
  },
  required: ["scenes"],
  additionalProperties: false,
} as const;

const PHOTO_STYLE =
  "Candid documentary photograph, natural window light, real people and real places, authentic imperfect composition, shallow depth of field, shot on a 35mm lens, no studio gloss, no illustration, no 3D render.";

function artPrompt(object: string, c: { primary: string; accent: string }) {
  return `Clean flat vector illustration of ${object}. One single centred object, simple friendly shapes, soft subtle shadow, colour palette ${c.primary} and ${c.accent} with white and light grey, plain pure white background, generous empty margin around the object. No text, no letters, no numbers, no logos, no people's faces.`;
}

/** Whole-sentence budget: the voice is never trimmed, so the SCRIPT is fitted to the time limit. */
export function maxSeconds(): number {
  const n = Number.parseInt(process.env["EXPLAINER_MAX_SECONDS"] ?? "30", 10);
  return Number.isFinite(n) && n >= 10 ? Math.min(n, 60) : 30;
}
const wordBudget = () => Math.floor(maxSeconds() * 2.2);
const wordCount = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

/** Drops the longest middle scenes until the spoken words fit the time limit. Keeps first and last. */
function fitToBudget(list: ExplainerScene[]): ExplainerScene[] {
  const out = [...list];
  const total = () => out.reduce((n, sc) => n + wordCount(sc.voice), 0);
  while (total() > wordBudget() && out.length > 3) {
    let worst = 1;
    for (let i = 1; i < out.length - 1; i++) if (wordCount(out[i]!.voice) > wordCount(out[worst]!.voice)) worst = i;
    out.splice(worst, 1);
  }
  return out;
}

/** The embedded font is Latin only and the voice is English: drop any stray foreign-script characters a model may emit. */
const clean = (t: unknown): string =>
  String(t ?? "")
    .replace(/[^\u0000-\u024F\u2010-\u2027\u20AC\u20B9]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

const strList = (x: unknown): string[] => (Array.isArray(x) ? x.map((v) => String(v ?? "").trim()).filter(Boolean) : []);

/** Cleans one scene returned by the AI so every layout always gets safe, complete fields. */
function normaliseScene(raw: Record<string, unknown>): ExplainerScene | null {
  const voice = clean(raw["voice"]).replace(/\*+/g, "").replace(/\s{2,}/g, " ").trim(); // plain words only: it is spoken and captioned
  if (!voice) return null;
  const layoutId = LAYOUT_BY_ID.has(String(raw["layout"])) ? String(raw["layout"]) : "hook";
  const arr = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);
  return {
    layout: layoutId,
    voice,
    title: clean(raw["title"]),
    sub: clean(raw["sub"]),
    items: arr(raw["items"])
      .map((x) => ({ t: clean(x["t"]), d: clean(x["d"]), i: String(x["i"] ?? "spark").trim().toLowerCase() }))
      .filter((x) => x.t),
    stats: arr(raw["stats"])
      .map((x) => ({ v: String(x["v"] ?? "").trim(), l: String(x["l"] ?? "").trim() }))
      .filter((x) => x.v),
    a: strList(raw["a"]).map(clean).filter(Boolean),
    b: strList(raw["b"]).map(clean).filter(Boolean),
    img: clean(raw["img"]),
  };
}

/** When stock footage is configured, every video gets at least one real-footage scene. */
function ensureBroll(list: ExplainerScene[], maxBroll: number, input?: ExplainerInput): ExplainerScene[] {
  if (maxBroll < 1 || !(process.env["PIXABAY_API_KEY"]?.trim() || process.env["PEXELS_API_KEY"]?.trim()) || (process.env["STOCK_MEDIA"] ?? "on").trim().toLowerCase() === "off") return list;
  if (list.some((sc) => sc.layout === "broll")) return list;
  const out = [...list];
  // the first plain headline or statement scene after the opener
  const at = out.findIndex((sc, i) => i > 0 && i < out.length - 1 && (sc.layout === "hook" || sc.layout === "statement") && sc.title);
  if (at < 0) {
    // nothing plain to convert: add a short real-life scene right after the opener
    const line = clean(input?.item.summary ?? "").split(/(?<=[.!?])\s/)[0]?.split(/\s+/).slice(0, 11).join(" ").replace(/[.!?]+$/, "") ?? "";
    const idea = clean(input?.item.title ?? "") || clean(input?.brandName ?? "");
    if (!line || !idea || out.length < 2) return out;
    out.splice(1, 0, { ...blank(), layout: "broll", voice: `${line}.`, title: line, img: idea });
    return out;
  }
  const idea = out[at]!.img || out[at]!.title.replace(/\*\*/g, "");
  out[at] = { ...out[at]!, layout: "broll", img: idea };
  return out;
}

/** Enforces: valid layout, no repeats back to back, a cap on pictures, and a closing call to action. */
function arrange(list: ExplainerScene[], maxImages: number, maxBroll: number): ExplainerScene[] {
  let images = 0;
  let broll = 0;
  const out: ExplainerScene[] = [];
  list.forEach((sc, i) => {
    const isLast = i === list.length - 1;
    let layout = LAYOUT_BY_ID.get(sc.layout) ?? LAYOUT_BY_ID.get("hook")!;
    if (isLast) layout = LAYOUT_BY_ID.get("cta_end")!;
    else if (layout.id === "cta_end" || !layout.ok(sc)) layout = LAYOUT_BY_ID.get("hook")!;
    if (layout.image === "video") {
      if (broll >= maxBroll || !sc.img) layout = LAYOUT_BY_ID.get("hook")!;
      else broll += 1;
    } else if (layout.image) {
      if (images >= maxImages || !sc.img) layout = LAYOUT_BY_ID.get("hook")!;
      else images += 1;
    }
    if (out.length && out[out.length - 1]!.layout === layout.id && !isLast) layout = LAYOUT_BY_ID.get("statement")!;
    out.push({ ...sc, layout: layout.id });
  });
  return out;
}

type Admin = import("@supabase/supabase-js").SupabaseClient<import("@/integrations/supabase/types").Database>;

/** Library: the opening lines of this brand's recent videos, so the next one does not repeat them. */
async function recentHooks(admin: Admin, input: ExplainerInput): Promise<string> {
  if (!input.userId) return "";
  try {
    let q = (admin as unknown as import("@supabase/supabase-js").SupabaseClient)
      .from("brand_scripts")
      .select("hook")
      .eq("user_id", input.userId)
      .order("created_at", { ascending: false })
      .limit(6);
    q = input.brandId ? q.eq("brand_id", input.brandId) : q.is("brand_id", null);
    const { data } = await q;
    return (data ?? []).map((r: { hook: string | null }) => `"${(r.hook ?? "").slice(0, 60)}"`).filter((x: string) => x.length > 2).join("; ");
  } catch {
    return "";
  }
}

/**
 * The brand brain's plan for this video (content pillar, hook style, scene recipe), read from the item.
 * Returns "" when there is none (older items, or the migration is not run yet), so nothing changes.
 */
async function styleDirection(admin: Admin, input: ExplainerInput): Promise<string> {
  try {
    const { data } = await (admin as unknown as import("@supabase/supabase-js").SupabaseClient)
      .from("content_items")
      .select("style_meta")
      .eq("id", input.item.id)
      .maybeSingle();
    const meta = (data as { style_meta?: { pillar?: string; hook?: string; recipe?: string } | null } | null)?.style_meta;
    if (!meta) return "";
    const { REEL_RECIPES, HOOK_STYLES } = await import("@/lib/variety.server");
    const recipe = REEL_RECIPES.find((r) => r.id === meta.recipe);
    const hook = HOOK_STYLES.find((h) => h.id === meta.hook);
    const lines = [
      meta.pillar ? `Content pillar for this video: ${meta.pillar}.` : "",
      hook ? `Hook style: ${hook.id} (${hook.how}).` : "",
      recipe
        ? `Scene recipe to follow as a guide: ${recipe.order} (${recipe.note}). Keep this order where each layout has what it needs; if a layout cannot be filled with real brand information, swap it for the closest one that can.`
        : "",
    ].filter(Boolean);
    return lines.length ? `${lines.join("\n")}\n` : "";
  } catch {
    return "";
  }
}

/** Library: keeps every script (layouts, lines, length) so the library grows with each video. Never throws. */
async function saveScript(admin: Admin, input: ExplainerInput, scenes: ExplainerScene[]) {
  if (!input.userId) return;
  try {
    const words = scenes.reduce((n, sc) => n + wordCount(sc.voice), 0);
    await (admin as unknown as import("@supabase/supabase-js").SupabaseClient).from("brand_scripts").insert({
      user_id: input.userId,
      brand_id: input.brandId ?? null,
      content_item_id: input.item.id,
      hook: scenes[0]?.voice ?? null,
      layouts: scenes.map((sc) => sc.layout),
      scenes: scenes.map((sc) => ({ layout: sc.layout, voice: sc.voice, title: sc.title, sub: sc.sub, items: sc.items, stats: sc.stats, a: sc.a, b: sc.b, img: sc.img })),
      total_words: words,
      est_seconds: Math.round(words / 2.2),
    });
  } catch (error) {
    console.error("[explainer] could not save script to the library", error);
  }
}

/**
 * Writes the scene-by-scene script (voice line + chosen layout + that layout's fields), then paints
 * the few pictures the chosen layouts need (reusing the media library first) and stores them so
 * Shotstack can fetch them. Never throws: falls back to a plain script without pictures.
 */
export async function prepareScenes(
  admin: import("@supabase/supabase-js").SupabaseClient<import("@/integrations/supabase/types").Database>,
  input: ExplainerInput,
  brand: unknown,
  videoScript: string,
): Promise<ExplainerScene[]> {
  const fallback = fallbackScenes(input);
  let scenes: ExplainerScene[] = fallback;
  const maxImages = Math.max(0, Number.parseInt(process.env["EXPLAINER_MAX_IMAGES"] ?? "2", 10) || 0);
  const count = Math.min(6, Math.max(4, Number.parseInt(process.env["EXPLAINER_SCENES"] ?? "5", 10) || 5));
  const maxBroll = Math.max(0, Number.parseInt(process.env["EXPLAINER_MAX_BROLL"] ?? "3", 10) || 0);
  const budget = wordBudget();
  const recent = await recentHooks(admin, input);
  const direction = await styleDirection(admin, input);
  const colors = { primary: cleanColor(input.colors?.primary, "#4f46e5"), accent: cleanColor(input.colors?.accent, "#f59e0b") };

  try {
    const [{ chatJSON }, { brandContext }] = await Promise.all([import("@/lib/ai.server"), import("@/lib/content.server")]);
    const plan = explainerPlan(input);
    const out = await chatJSON<{ scenes?: Record<string, unknown>[] }>(
      "You direct short vertical explainer videos that sell one specific brand, in the style of polished social-media motion graphics. Plain, human, specific. Never invent prices, numbers, awards, statistics, customers, testimonials or ratings that are not in the brand information. Write in the language and tone the brand itself uses (English by default; Hinglish if the brand writes that way).",
      `${brandContext(brand as never)}

Topic of this video: ${input.item.title ?? ""}
Summary: ${input.item.summary ?? ""}
Draft script: ${videoScript}
Selling points to use: ${plan.points.join(" | ")}
Call to action: ${plan.cta}
Brand website: ${input.website}

The whole video must be ${maxSeconds()} seconds or less when spoken aloud. That means the TOTAL of all "voice" lines is at most ${budget} words and every voice line is a COMPLETE sentence of at most 13 words (never a fragment that depends on the next line).
${recent ? `Recent videos for this brand already used these hooks, so open differently: ${recent}\n` : ""}${direction}Write exactly ${count} scenes. Scene 1 is a hook that stops the scroll (a problem the audience feels). The middle scenes each teach ONE concrete thing about THIS brand using its own products, services and words. The last scene is the call to action naming ${input.brandName} (layout "cta_end").

Each scene is one screen. Choose the layout that best SHOWS the idea, vary them (never the same layout twice in a row, mix text, list, phone and comparison screens). Layouts:
${layoutCatalogue()}
- cta_end: last scene only (title = the action line, sub = short reassurance).

For every scene return ALL of these fields (use "" or [] when a field is not used by the chosen layout):
- "layout": one of the layout ids above
- "voice": what the voice says, ONE complete spoken sentence, max 13 words, conversational
- "title": the on-screen headline, max 8 words, same key words as the voice line (wrap ONE key word in **double stars**)
- "sub": the extra line the layout needs (see layout), max 14 words
- "items": [{"t":"short title","d":"one short line","i":"icon"}] icons: ${ICON_LIST}
- "stats": [{"v":"number","l":"label"}] ONLY if the number appears in the brand information
- "a" / "b": short points for compare layouts
- "img": a concrete picture or stock-clip idea ONLY for photo_hero, split_photo, illustration or broll; otherwise ""

Use at most ${maxImages} picture layouts. Use between ${maxBroll > 0 ? 1 : 0} and ${maxBroll} "broll" (stock video) layouts: at least one scene must be "broll" when the brand can be shown through real life. Choose "broll" for scenes where real life, people at work, shops, customers or results make the brand's positioning message feel real, and give "img" as a concrete, filmable stock-footage search of 2 to 4 plain words that describe what the camera sees. It must show THIS brand's own products, craft, customers or setting (for a brass handicraft store: "brass diya lamp", "artisan hands metalwork", "festival lamps lit"; for a cafe: "barista pouring coffee"; for a clinic: "doctor patient consultation"), never a generic office, family or lifestyle scene that has nothing to do with what the brand sells. Never use the headline, abstract ideas, landmarks, places or temples, a person's name or a brand. Do not add contact details that are not in the brand information.
Return JSON: {"scenes":[...]}`,
      SCENE_SCHEMA as unknown as Record<string, unknown>,
    );
    // Never keep a number the brand did not give us (the model sometimes invents statistics).
    const facts = brandContext(brand as never).replace(/[,\s]/g, "").toLowerCase();
    const numbersOk = (text: string) =>
      (text.match(/\d+(?:\.\d+)?/g) ?? []).every((n) => facts.includes(n));
    const good = (out.scenes ?? [])
      .map(normaliseScene)
      .filter((x): x is ExplainerScene => Boolean(x))
      .map((sc) => ({ ...sc, stats: sc.stats.filter((st) => numbersOk(st.v)) }))
      .filter((sc) => !/\d\s?%/.test(`${sc.voice} ${sc.title} ${sc.sub}`) || numbersOk(`${sc.voice} ${sc.title} ${sc.sub}`))
      .slice(0, 7);
    if (good.length >= 4) scenes = fitToBudget(ensureBroll(arrange(good, maxImages, maxBroll), maxBroll, input));
  } catch (error) {
    console.error("[explainer] scene writer failed, using plain script:", error);
  }

  const imagesOff = (process.env["EXPLAINER_IMAGES"] ?? "on").toLowerCase() === "off";
  try {
    const { generateImageBytes } = await import("@/lib/ai.server");
    const { reuseOrGenerate } = await import("@/lib/media-library.server");
    const { stockVideo, stockPhotoBytes, brandPhotoBytes } = await import("@/lib/stock-media.server");
    const ownUsed = new Set<string>();
    const ownShare = Math.max(0, Math.min(100, Number(process.env["OWN_PHOTO_SHARE"] ?? 70) || 70));
    const withTimeout = <T,>(p: Promise<T>, ms: number) =>
      Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("image timeout")), ms))]);

    // 1) stock video clips (one after another so two scenes never pick the same clip)
    if (input.userId) {
      const used = new Set<string>();
      for (const sc of scenes) {
        if (LAYOUT_BY_ID.get(sc.layout)?.image !== "video" || !sc.img) continue;
        const clip = await stockVideo(admin as never, { userId: input.userId, brandId: input.brandId ?? null, idea: sc.img, exclude: used });
        sc.videoUrl = clip?.url ?? null;
      }
    }

    // 2a) the brand's own uploaded photos come first for photo scenes: the real product and place beat stock
    const ownMap = new Map<number, Uint8Array>();
    if (input.userId && input.brandId && ownShare > 0) {
      for (let idx = 0; idx < scenes.length; idx++) {
        const sc = scenes[idx]!;
        if (LAYOUT_BY_ID.get(sc.layout)?.image !== "photo" || !sc.img) continue;
        if ((idx * 37 + sc.img.length * 11) % 100 >= ownShare) continue;
        const own = await brandPhotoBytes(admin as never, { userId: input.userId, brandId: input.brandId, seed: `${input.item.id}|${idx}`, used: ownUsed });
        if (own) ownMap.set(idx, own);
      }
    }

    // 2b) photos (free Pixabay photo first, fal only if none fits) and illustrations (fal)
    const made = await Promise.allSettled(
      scenes.map(async (sc, idx) => {
        const kind = LAYOUT_BY_ID.get(sc.layout)?.image;
        if (!kind || kind === "video" || !sc.img) return null;
        if (ownMap.has(idx)) return { bytes: ownMap.get(idx)! };
        const aspect = kind === "photo" ? "9:16" : "1:1";
        const prompt =
          kind === "photo"
            ? `${PHOTO_STYLE} ${sc.img}. Vertical 9:16 composition with calm empty space in the lower third. No text, no letters, no logos.`
            : artPrompt(sc.img, colors);
        const make = async () => {
          if (kind === "photo") {
            const free = await stockPhotoBytes(sc.img);
            if (free) return free;
          }
          if (imagesOff) throw new Error("EXPLAINER_IMAGES is off");
          return withTimeout(generateImageBytes(prompt, aspect), 40_000);
        };
        if (!input.userId) return { bytes: await make() };
        return reuseOrGenerate(
          admin as never,
          { userId: input.userId, brandId: input.brandId ?? null, kind: kind === "photo" ? "photo" : "art", aspect, text: `${sc.img} ${input.brandName}` },
          make,
        );
      }),
    );
    for (let i = 0; i < scenes.length; i++) {
      const r = made[i];
      if (r.status !== "fulfilled") {
        console.error("[explainer] scene image failed:", (r as PromiseRejectedResult).reason);
        continue;
      }
      if (!r.value) continue;
      const path = `explainer/${input.item.id}/scene-${i + 1}.png`;
      const up = await admin.storage.from("content-media").upload(path, r.value.bytes, { contentType: "image/png", upsert: true });
      if (up.error) continue;
      const { data } = await admin.storage.from("content-media").createSignedUrl(path, 60 * 60 * 6);
      scenes[i]!.imageUrl = data?.signedUrl ?? null;
    }
  } catch (error) {
    console.error("[explainer] scene media failed:", error);
  }

  // A picture layout whose picture or clip could not be found becomes a plain headline scene
  // (white text over nothing would be unreadable).
  for (const sc of scenes) {
    const needs = LAYOUT_BY_ID.get(sc.layout)?.image;
    if (needs && !sc.imageUrl && !sc.videoUrl) sc.layout = "hook";
  }
  await saveScript(admin, input, scenes);
  return scenes;
}

export function buildTimeline(input: ExplainerInput, embedFont = true) {
  const c = input.colors ?? {};
  const primary = cleanColor(c.primary, "#4f46e5");
  const secondary = cleanColor(c.secondary, "#0f172a");
  const accent = cleanColor(c.accent, "#f59e0b");
  const plan = explainerPlan(input);
  const T: Theme = {
    primary,
    secondary,
    accent,
    onAccent: readableOn(accent),
    onPrimary: readableOn(primary),
    brand: input.brandName,
    website: input.website,
    cta: plan.cta,
    hasLogo: Boolean(input.logoUrl),
    H,
    embedFont,
  };
  const scenes = input.scenes && input.scenes.length >= 3 ? input.scenes : fallbackScenes(input);
  const last = scenes.length - 1;
  const voice = process.env["SHOTSTACK_VOICE"]?.trim();
  const synced = Boolean(voice); // with a voice, every scene lasts exactly as long as its voice line
  const FIXED = Math.min(5, Math.floor((maxSeconds() / scenes.length) * 10) / 10); // silent mode: still within the limit
  const timing = (i: number) => (synced ? { start: `alias://v${i}`, length: `alias://v${i}` } : { start: i * FIXED, length: FIXED });

  const sceneClips: unknown[] = [];
  const imageClips: unknown[] = [];
  const cardClips: unknown[] = [];
  scenes.forEach((sc, i) => {
    const rendered = renderScene(sc, T, i, scenes.length, i === last);
    const transition = { in: TRANSITIONS[i % TRANSITIONS.length], out: "fade" };
    sceneClips.push({ asset: rendered.asset, ...timing(i), width: W, height: H, transition });
    if (rendered.layout.id === "broll" && sc.videoUrl) {
      imageClips.push({
        asset: { type: "video", src: sc.videoUrl, volume: 0 },
        ...timing(i),
        fit: "cover",
        width: W,
        height: H,
        position: "center",
      });
    } else if (rendered.layout.image && sc.imageUrl) {
      if (rendered.layout.id === "illustration") {
        const side = Math.round(Math.min(W * 0.72, H * 0.4));
        cardClips.push({
          asset: {
            type: "html5",
            html: "<div class='c'></div>",
            css: `html,body{margin:0;padding:0;width:${side}px;height:${side}px;overflow:hidden}.c{width:${side}px;height:${side}px;border-radius:44px;background:#fff;box-shadow:0 18px 50px rgba(15,23,42,.14)}`,
          },
          width: side,
          height: side,
          ...timing(i),
          position: "center",
          offset: { y: -0.02 },
        });
        imageClips.push({
          asset: { type: "image", src: sc.imageUrl },
          ...timing(i),
          fit: "contain",
          width: Math.round(side * 0.82),
          height: Math.round(side * 0.82),
          position: "center",
          offset: { y: -0.02 },
          transition: { in: "zoom", out: "fade" },
        });
      } else if (rendered.layout.id === "split_photo") {
        imageClips.push({
          asset: { type: "image", src: sc.imageUrl },
          ...timing(i),
          fit: "cover",
          width: W,
          height: Math.round(H * 0.56),
          position: "top",
          effect: "zoomIn",
        });
      } else {
        imageClips.push({ asset: { type: "image", src: sc.imageUrl }, ...timing(i), fit: "cover", effect: "zoomIn", transition: { in: "fade", out: "fade" } });
      }
    }
  });

  // Optional captions: the spoken line shown as a clean English subtitle near the bottom
  // (EXPLAINER_CAPTIONS=on), for people watching with the sound off.
  const captionClips: unknown[] = [];
  if ((process.env["EXPLAINER_CAPTIONS"] ?? "").trim().toLowerCase() === "on") {
    const capH = 230;
    scenes.forEach((sc, i) => {
      const line = String(sc.voice ?? "").replace(/\*+/g, "").trim();
      if (!line || i === last) return; // the closing call-to-action screen already carries its own words
      captionClips.push({
        asset: {
          type: "html5",
          html: `<div class='w'><div class='cap'>${esc(line)}</div></div>`,
          css: `${embedFont ? FONT_CSS : ""}html,body{margin:0;padding:0;width:${W}px;height:${capH}px;overflow:hidden;background:transparent}.w{width:${W}px;height:${capH}px;display:flex;align-items:center;justify-content:center;padding:0 48px}.cap{font-family:'Montserrat',Arial,Helvetica,sans-serif;font-weight:700;font-size:38px;line-height:1.3;text-align:center;color:#fff;background:rgba(15,23,42,.82);padding:16px 26px;border-radius:22px}`,
        },
        width: W,
        height: capH,
        ...timing(i),
        position: "bottom",
        offset: { y: 0.05 },
        transition: { in: "fade", out: "fade" },
      });
    });
  }

  const tracks: unknown[] = [];
  if (synced) {
    tracks.push({
      clips: scenes.map((sc, i) => ({
        asset: { type: "audio", prompt: sc.voice, model: "elevenlabs-multilingual-v2", options: { voice } },
        start: "auto",
        length: "auto",
        alias: `v${i}`,
      })),
    });
  }
  if (input.logoUrl) {
    tracks.push({
      clips: [{ asset: { type: "image", src: input.logoUrl }, start: 0, length: "end", position: "topLeft", offset: { x: 0.05, y: -0.028 }, fit: "contain", width: 72, height: 72 }],
    });
  }
  if (captionClips.length) tracks.push({ clips: captionClips });
  tracks.push({ clips: sceneClips });
  if (cardClips.length) tracks.push({ clips: cardClips });
  if (imageClips.length) tracks.push({ clips: imageClips });
  tracks.push({ clips: [{ asset: dottedBackground(T), start: 0, length: "end", width: W, height: H }] });

  const music = process.env["EXPLAINER_MUSIC_URL"]?.trim();
  return {
    timeline: {
      background: "#f5f6fa",
      ...(music ? { soundtrack: { src: music, effect: "fadeOut", volume: 0.12 } } : {}),
      tracks,
    },
    output: { format: "mp4", size: { width: W, height: H } },
  };
}

export async function submitExplainerRender(input: ExplainerInput): Promise<string> {
  if (/^rendering\b/i.test(String(input.item.title ?? ""))) {
    throw new Error("The content text is not written yet; the video will start once it is.");
  }
  const { spendGuard, recordSpend } = await import("@/lib/spend-guard.server");
  await spendGuard("shotstack_render"); // refuses (at no cost) once today's limit is reached
  const send = (embedFont: boolean) => {
    const body = JSON.stringify(buildTimeline(input, embedFont));
    console.log(`[explainer] render request ${Math.round(body.length / 1024)} KB (embedded font: ${embedFont})`);
    return fetch(`${base()}/render`, {
      method: "POST",
      headers: { "x-api-key": key(), "content-type": "application/json" },
      body,
    });
  };
  let res = await send(process.env["EXPLAINER_FONT"]?.trim().toLowerCase() !== "system");
  // 413 = request too large: retry once without the embedded font (uses the system font instead).
  if (res.status === 413) res = await send(false);
  const text = await res.text();
  if (!res.ok) throw new Error(`Shotstack render request failed [${res.status}]: ${text.slice(0, 400)}`);
  const json = JSON.parse(text) as { response?: { id?: string } };
  const id = json.response?.id;
  if (!id) throw new Error("Shotstack did not return a render id.");
  await recordSpend("shotstack_render");
  return id;
}

export async function explainerStatus(id: string): Promise<{ status: "queued" | "in_progress" | "completed" | "failed"; url?: string; error?: string }> {
  const res = await fetch(`${base()}/render/${id}`, { headers: { "x-api-key": key() } });
  const text = await res.text();
  if (!res.ok) throw new Error(`Shotstack status check failed [${res.status}]: ${text.slice(0, 300)}`);
  const r = (JSON.parse(text) as { response?: { status?: string; url?: string; error?: string } }).response ?? {};
  const s = (r.status ?? "").toLowerCase();
  if (s === "done") return { status: "completed", url: r.url };
  if (s === "failed") return { status: "failed", error: r.error || "Shotstack render failed." };
  if (s === "queued" || s === "fetching") return { status: "queued" };
  return { status: "in_progress" };
}

export async function explainerBytes(id: string): Promise<Uint8Array> {
  const st = await explainerStatus(id);
  if (st.status !== "completed" || !st.url) throw new Error("Shotstack video is not ready yet.");
  const res = await fetch(st.url);
  if (!res.ok) throw new Error(`Could not download the Shotstack video [${res.status}]`);
  return new Uint8Array(await res.arrayBuffer());
}
