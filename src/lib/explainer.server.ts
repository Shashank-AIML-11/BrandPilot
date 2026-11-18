/**
 * Branded explainer videos (like a designed ad): hook → 3 selling points → call-to-action,
 * with brand colours, logo, animated text, an AI voiceover and optional music.
 * Everything is assembled by ONE provider, Shotstack, from a single timeline.
 *
 * Switch on with VIDEO_PROVIDER=shotstack. Env:
 *   SHOTSTACK_API_KEY   (required)  — key of the matching environment
 *   SHOTSTACK_ENV       stage (free sandbox, watermarked) | v1 (production)   default: stage
 *   SHOTSTACK_VOICE     (required for voiceover) a voice id from GET /edit/<env>/models?expand=options
 *   EXPLAINER_PHOTOS    on = also generate one background photo with Shotstack credits (default off)
 *   EXPLAINER_MUSIC_URL optional public mp3 link for background music
 *
 * Written from Shotstack's documentation and NOT live-tested (no key was available): if
 * Shotstack rejects a field, its exact message is shown on the video card.
 */
import { posterCopyFor, cleanColor } from "@/lib/poster.server";

export interface ExplainerScene {
  voice: string; // what the voice says in this scene
  text: string; // short on-screen message that matches the voice line
  imageUrl?: string | null; // background photo for the scene
}

export interface ExplainerInput {
  item: { id: string; title?: string | null; summary?: string | null; image_prompt?: string | null };
  brandName: string;
  website: string;
  colors?: { primary?: string; secondary?: string; accent?: string } | null;
  logoUrl?: string | null; // public/signed URL
  scenes?: ExplainerScene[]; // written + illustrated by prepareScenes()
  photoPrompt?: string | null;
}

const W = 720;
const H = 1280;

function base(): string {
  const env = (process.env["SHOTSTACK_ENV"] ?? "stage").trim() || "stage";
  return `https://api.shotstack.io/edit/${env}`;
}
function key(): string {
  const k = process.env["SHOTSTACK_API_KEY"]?.trim();
  if (!k) throw new Error("Video assembly is not configured (missing SHOTSTACK_API_KEY).");
  return k;
}
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function explainerEnabled(): boolean {
  return (process.env["VIDEO_PROVIDER"] ?? "").trim().toLowerCase() === "shotstack";
}

/** Plain fallback script (hook, selling points, call to action) if the AI scene writer fails. */
export function explainerPlan(input: ExplainerInput) {
  const copy = posterCopyFor(input.item, { website: input.website });
  const points = copy.points.length ? copy.points : [copy.subline].filter(Boolean);
  return { headline: copy.headline, points: points.slice(0, 3), cta: copy.cta };
}

function fallbackScenes(input: ExplainerInput): ExplainerScene[] {
  const plan = explainerPlan(input);
  return [
    { voice: plan.headline, text: plan.headline },
    ...plan.points.map((p) => ({ voice: p, text: p })),
    { voice: `${plan.cta} with ${input.brandName}`, text: plan.cta },
  ];
}

const SCENE_SCHEMA = {
  type: "object",
  properties: {
    scenes: {
      type: "array",
      items: {
        type: "object",
        properties: { voice: { type: "string" }, text: { type: "string" }, visual: { type: "string" } },
        required: ["voice", "text", "visual"],
        additionalProperties: false,
      },
    },
  },
  required: ["scenes"],
  additionalProperties: false,
} as const;

const PHOTO_STYLE =
  "Candid documentary photograph, natural window light, real people and real places, authentic imperfect composition, shallow depth of field, shot on a 35mm lens, no studio gloss, no illustration, no 3D render.";

/**
 * Writes the scene-by-scene script (voice line + matching on-screen text + a photo idea per scene),
 * then paints one photo per scene and stores it so Shotstack can fetch it.
 * Never throws: falls back to a plain script without photos.
 */
export async function prepareScenes(
  admin: import("@supabase/supabase-js").SupabaseClient<import("@/integrations/supabase/types").Database>,
  input: ExplainerInput,
  brand: unknown,
  videoScript: string,
): Promise<ExplainerScene[]> {
  const fallback = fallbackScenes(input);
  let scenes: ExplainerScene[] = fallback;
  let visuals: string[] = [];
  try {
    const [{ chatJSON }, { brandContext }] = await Promise.all([
      import("@/lib/ai.server"),
      import("@/lib/content.server"),
    ]);
    const plan = explainerPlan(input);
    const out = await chatJSON<{ scenes?: { voice?: string; text?: string; visual?: string }[] }>(
      "You write short vertical marketing videos (about 25 seconds) that sell one specific brand. Plain, human, specific. Never invent prices, awards, statistics or customers that are not in the brand information.",
      `${brandContext(brand as never)}

Topic of this video: ${input.item.title ?? ""}
Summary: ${input.item.summary ?? ""}
Draft script: ${videoScript}
Selling points to use: ${plan.points.join(" | ")}
Call to action: ${plan.cta}

Write exactly 5 scenes:
1. Hook: a bold, specific line that stops the scroll (a problem the audience feels).
2-4. One concrete benefit of THIS brand per scene, using the brand's own products, services and words.
5. Call to action that names the brand: ${input.brandName}.

For each scene return:
- "voice": what the presenter says, one spoken sentence, max 18 words, conversational.
- "text": the on-screen message for that same scene, max 7 words, a punchy version of the voice line (same meaning, same key words).
- "visual": a concrete real-world photo idea for the background (people, place, action). Never include words, logos or text in the photo.

Return JSON: {"scenes":[{"voice":"...","text":"...","visual":"..."}, ...]}`,
      SCENE_SCHEMA as unknown as Record<string, unknown>,
    );
    const good = (out.scenes ?? []).filter((x) => x.voice?.trim() && x.text?.trim()).slice(0, 6);
    if (good.length >= 3) {
      scenes = good.map((x) => ({ voice: x.voice!.trim(), text: x.text!.trim() }));
      visuals = good.map((x) => (x.visual ?? "").trim());
    }
  } catch (error) {
    console.error("[explainer] scene writer failed, using plain script:", error);
  }

  if ((process.env["EXPLAINER_IMAGES"] ?? "on").toLowerCase() === "off") return scenes;

  try {
    const { generateImageBytes } = await import("@/lib/ai.server");
    const withTimeout = <T,>(p: Promise<T>, ms: number) =>
      Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("image timeout")), ms))]);
    const made = await Promise.allSettled(
      scenes.map((_, i) =>
        withTimeout(
          generateImageBytes(
            `${PHOTO_STYLE} ${visuals[i] || input.photoPrompt || input.item.title || input.brandName}. Vertical 9:16 composition with empty space in the lower third. No text, no letters, no logos.`,
            "9:16",
          ),
          40_000,
        ),
      ),
    );
    for (let i = 0; i < scenes.length; i++) {
      const r = made[i];
      if (r.status !== "fulfilled") {
        console.error("[explainer] scene image failed:", (r as PromiseRejectedResult).reason);
        continue;
      }
      const path = `explainer/${input.item.id}/scene-${i + 1}.png`;
      const up = await admin.storage.from("content-media").upload(path, r.value, { contentType: "image/png", upsert: true });
      if (up.error) continue;
      const { data } = await admin.storage.from("content-media").createSignedUrl(path, 60 * 60 * 6);
      scenes[i]!.imageUrl = data?.signedUrl ?? null;
    }
  } catch (error) {
    console.error("[explainer] scene images failed:", error);
  }
  return scenes;
}

function cardHtml(text: string, css: string, extra = "") {
  return {
    type: "html",
    html: `<div class="w"><div class="bar"></div><h2>${esc(text)}</h2>${extra}</div>`,
    css: `*{box-sizing:border-box;margin:0;padding:0}body{width:${W}px;height:${H}px;font-family:'Montserrat','Open Sans',Arial,sans-serif;display:flex;align-items:flex-end;justify-content:center}.w{width:100%;padding:0 50px 170px;text-align:left}.bar{width:84px;height:8px;border-radius:4px;margin-bottom:22px}h2{color:#fff;font-weight:800;font-size:54px;line-height:1.14;text-shadow:0 3px 18px rgba(0,0,0,.55)}${css}`,
    width: W,
    height: H,
  };
}

export function buildTimeline(input: ExplainerInput) {
  const c = input.colors ?? {};
  const primary = cleanColor(c.primary, "#4f46e5");
  const secondary = cleanColor(c.secondary, "#0f172a");
  const accent = cleanColor(c.accent, "#f59e0b");
  const scenes = input.scenes && input.scenes.length >= 3 ? input.scenes : fallbackScenes(input);
  const voice = process.env["SHOTSTACK_VOICE"]?.trim();
  const synced = Boolean(voice); // with a voice, every scene lasts exactly as long as its voice line
  const FIXED = 4.5;
  const fade = { in: "fade", out: "fade" };

  const timing = (i: number) =>
    synced
      ? { start: `alias://v${i}`, length: `alias://v${i}` }
      : { start: i * FIXED, length: FIXED };

  const textClips = scenes.map((sc, i) => {
    const last = i === scenes.length - 1;
    const first = i === 0;
    const kicker = first ? `<div class="k">${esc(input.brandName)}</div>` : "";
    const button = last
      ? `<div class="b">${esc(explainerPlan(input).cta)} &rarr;</div>${input.website ? `<div class="u">${esc(input.website.replace(/^https?:\/\//, ""))}</div>` : ""}`
      : "";
    return {
      asset: cardHtml(
        sc.text,
        `.bar{background:${accent}}.k{color:${accent};font-weight:700;letter-spacing:4px;text-transform:uppercase;font-size:22px;margin-bottom:14px}.b{display:inline-block;margin-top:34px;background:${accent};color:${secondary};font-weight:800;font-size:34px;padding:18px 40px;border-radius:60px}.u{margin-top:16px;color:#fff;font-size:24px;font-weight:600;opacity:.9}`,
        kicker + button,
      ),
      ...timing(i),
      transition: fade,
    };
  });

  const imageClips = scenes
    .map((sc, i) =>
      sc.imageUrl
        ? { asset: { type: "image", src: sc.imageUrl }, ...timing(i), fit: "cover", effect: "zoomIn", transition: fade }
        : null,
    )
    .filter(Boolean);

  // dark gradient over photos so the text stays readable
  const shade = {
    asset: {
      type: "html",
      html: "<div></div>",
      css: `*{margin:0;padding:0}body{width:${W}px;height:${H}px;background:linear-gradient(to top,rgba(0,0,0,.72) 0%,rgba(0,0,0,.25) 45%,rgba(0,0,0,0) 70%)}`,
      width: W,
      height: H,
    },
    start: 0,
    length: "end",
  };
  const bg = {
    asset: {
      type: "html",
      html: "<div></div>",
      css: `*{margin:0;padding:0}body{width:${W}px;height:${H}px;background:linear-gradient(160deg,${secondary},${primary})}`,
      width: W,
      height: H,
    },
    start: 0,
    length: "end",
  };

  const tracks: unknown[] = [];
  if (synced) {
    tracks.push({
      clips: scenes.map((sc, i) => ({
        asset: {
          type: "audio",
          prompt: sc.voice,
          model: "elevenlabs-multilingual-v2",
          options: { voice },
        },
        start: "auto",
        length: "auto",
        alias: `v${i}`,
      })),
    });
  }
  if (input.logoUrl) {
    tracks.push({
      clips: [{ asset: { type: "image", src: input.logoUrl }, start: 0, length: "end", position: "top", offset: { y: -0.06 }, fit: "contain", width: 300, height: 96 }],
    });
  }
  tracks.push({ clips: textClips });
  tracks.push({ clips: [shade] });
  if (imageClips.length) tracks.push({ clips: imageClips });
  tracks.push({ clips: [bg] });

  const music = process.env["EXPLAINER_MUSIC_URL"]?.trim();
  return {
    timeline: {
      background: secondary,
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
  const res = await fetch(`${base()}/render`, {
    method: "POST",
    headers: { "x-api-key": key(), "content-type": "application/json" },
    body: JSON.stringify(buildTimeline(input)),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Shotstack render request failed [${res.status}]: ${text.slice(0, 400)}`);
  const json = JSON.parse(text) as { response?: { id?: string } };
  const id = json.response?.id;
  if (!id) throw new Error("Shotstack did not return a render id.");
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
