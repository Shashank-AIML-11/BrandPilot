/**
 * "Explainer Light" branded explainer videos: light dotted background, brand logo on top, a large
 * on-screen line per scene synced to the voice, a rounded card with a flat illustration of one object,
 * and a gradient end card with a call-to-action pill. AI voiceover and optional music.
 * Everything is assembled by ONE provider, Shotstack, from a single timeline.
 *
 * Switch on with VIDEO_PROVIDER=shotstack. Env:
 *   SHOTSTACK_API_KEY   (required)  — key of the matching environment
 *   SHOTSTACK_ENV       stage (free sandbox, watermarked) | v1 (production)   default: stage
 *   SHOTSTACK_VOICE     (required for voiceover) a voice id from GET /edit/<env>/models?expand=options
 *   EXPLAINER_ASPECT    9:16 (720x1280, default) | 4:5 (720x900, like the sample)
 *   EXPLAINER_IMAGES    on (default) | off — illustrations per scene (reused from the media library when possible)
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

const W = 720;
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
        properties: { voice: { type: "string" }, text: { type: "string" }, object: { type: "string" } },
        required: ["voice", "text", "object"],
        additionalProperties: false,
      },
    },
  },
  required: ["scenes"],
  additionalProperties: false,
} as const;

function artPrompt(object: string, c: { primary: string; accent: string }) {
  return `Clean flat vector illustration of ${object}. One single centred object, simple friendly shapes, soft subtle shadow, colour palette ${c.primary} and ${c.accent} with white and light grey, plain pure white background, generous empty margin around the object. No text, no letters, no numbers, no logos, no people's faces.`;
}

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
  const colors = { primary: cleanColor(input.colors?.primary, "#4f46e5"), accent: cleanColor(input.colors?.accent, "#f59e0b") };
  try {
    const [{ chatJSON }, { brandContext }] = await Promise.all([
      import("@/lib/ai.server"),
      import("@/lib/content.server"),
    ]);
    const plan = explainerPlan(input);
    const out = await chatJSON<{ scenes?: { voice?: string; text?: string; object?: string }[] }>(
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
- "object": ONE simple physical object or icon that illustrates the scene (for example "a rupee coin stack", "a shopping bag", "a phone showing a chat"), 2-6 words, no words or logos. For scene 5 give "".

Return JSON: {"scenes":[{"voice":"...","text":"...","object":"..."}, ...]}`,
      SCENE_SCHEMA as unknown as Record<string, unknown>,
    );
    const good = (out.scenes ?? []).filter((x) => x.voice?.trim() && x.text?.trim()).slice(0, 6);
    if (good.length >= 3) {
      scenes = good.map((x) => ({ voice: x.voice!.trim(), text: x.text!.trim() }));
      visuals = good.map((x) => (x.object ?? "").trim());
    }
  } catch (error) {
    console.error("[explainer] scene writer failed, using plain script:", error);
  }

  if ((process.env["EXPLAINER_IMAGES"] ?? "on").toLowerCase() === "off") return scenes;

  try {
    const { generateImageBytes } = await import("@/lib/ai.server");
    const { reuseOrGenerate } = await import("@/lib/media-library.server");
    const withTimeout = <T,>(p: Promise<T>, ms: number) =>
      Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("image timeout")), ms))]);
    const last = scenes.length - 1;
    const made = await Promise.allSettled(
      scenes.map(async (_, i) => {
        if (i === last) return null; // the end card has no illustration
        const object = visuals[i] || input.item.title || input.brandName;
        const make = () => withTimeout(generateImageBytes(artPrompt(object, colors), "1:1"), 40_000);
        if (!input.userId) return { bytes: await make() };
        return reuseOrGenerate(
          admin as never,
          { userId: input.userId, brandId: input.brandId ?? null, kind: "art", aspect: "1:1", text: `${object} ${input.brandName}` },
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
    console.error("[explainer] scene images failed:", error);
  }
  return scenes;
}

const FONT = "'Montserrat','Open Sans',Arial,sans-serif";

const htmlAsset = (html: string, css: string, w = W, h = H) => ({
  type: "html",
  html,
  css: `*{box-sizing:border-box;margin:0;padding:0}body{width:${w}px;height:${h}px;font-family:${FONT}}${css}`,
  width: w,
  height: h,
});

export function buildTimeline(input: ExplainerInput) {
  const c = input.colors ?? {};
  const primary = cleanColor(c.primary, "#4f46e5");
  const secondary = cleanColor(c.secondary, "#0f172a");
  const accent = cleanColor(c.accent, "#f59e0b");
  const scenes = input.scenes && input.scenes.length >= 3 ? input.scenes : fallbackScenes(input);
  const last = scenes.length - 1;
  const voice = process.env["SHOTSTACK_VOICE"]?.trim();
  const synced = Boolean(voice); // with a voice, every scene lasts exactly as long as its voice line
  const FIXED = 4.5;
  const fade = { in: "fade", out: "fade" };
  const timing = (i: number) =>
    synced ? { start: `alias://v${i}`, length: `alias://v${i}` } : { start: i * FIXED, length: FIXED };

  // Big dark headline, top-left (white on the end card)
  const textClips = scenes.map((sc, i) => {
    const isLast = i === last;
    const extra = isLast
      ? `<div class="b">${esc(explainerPlan(input).cta)} &rarr;</div>${input.website ? `<div class="u">${esc(input.website.replace(/^https?:\/\//, ""))}</div>` : ""}`
      : "";
    return {
      asset: htmlAsset(
        `<div class="w">${isLast ? `<div class="k">${esc(input.brandName)}</div>` : ""}<h2>${esc(sc.text)}</h2>${extra}</div>`,
        isLast
          ? `.w{width:100%;height:100%;padding:0 60px;display:flex;flex-direction:column;justify-content:center}.k{color:#fff;opacity:.85;font-weight:700;letter-spacing:5px;text-transform:uppercase;font-size:24px;margin-bottom:18px}h2{color:#fff;font-weight:800;font-size:64px;line-height:1.12}.b{align-self:flex-start;margin-top:44px;background:${secondary};color:#fff;font-weight:800;font-size:32px;padding:20px 46px;border-radius:60px}.u{margin-top:20px;color:#fff;font-size:24px;font-weight:600;opacity:.9}`
          : `.w{width:100%;height:100%;padding:${Math.round(H * 0.16)}px 56px 0}h2{color:#0f172a;font-weight:800;font-size:${H < 1000 ? 52 : 58}px;line-height:1.14}`,
      ),
      ...timing(i),
      transition: fade,
    };
  });

  // Rounded white card + illustration (non-final scenes)
  const side = Math.round(Math.min(W * 0.72, H * 0.4));
  const cardY = H < 1000 ? 0.12 : 0.1; // offset (fraction of height) below the middle
  const cardClips = scenes
    .map((_, i) =>
      i === last
        ? null
        : {
            asset: htmlAsset(
              "<div class='c'></div>",
              `body{background:transparent}.c{width:${side}px;height:${side}px;border-radius:44px;background:#fff;box-shadow:0 18px 50px rgba(15,23,42,.14)}`,
              side,
              side,
            ),
            ...timing(i),
            position: "center",
            offset: { y: -cardY },
            transition: { in: "fade", out: "fade" },
          },
    )
    .filter(Boolean);
  const artClips = scenes
    .map((sc, i) =>
      i !== last && sc.imageUrl
        ? {
            asset: { type: "image", src: sc.imageUrl },
            ...timing(i),
            fit: "contain",
            width: Math.round(side * 0.82),
            height: Math.round(side * 0.82),
            position: "center",
            offset: { y: -cardY },
            transition: { in: "zoom", out: "fade" },
          }
        : null,
    )
    .filter(Boolean);

  // Gradient end card, only during the final scene
  const endCard = {
    asset: htmlAsset("<div></div>", `body{background:linear-gradient(155deg,${primary},${secondary})}`),
    ...timing(last),
    transition: { in: "fade" },
  };
  // Light dotted background for everything else
  const bg = {
    asset: htmlAsset(
      "<div></div>",
      `body{background-color:#f5f6fa;background-image:radial-gradient(rgba(15,23,42,.16) 2px,transparent 2.6px);background-size:30px 30px}`,
    ),
    start: 0,
    length: "end",
  };

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
      clips: [{ asset: { type: "image", src: input.logoUrl }, start: 0, length: "end", position: "top", offset: { y: -0.04 }, fit: "contain", width: 240, height: 80 }],
    });
  }
  tracks.push({ clips: textClips });
  if (artClips.length) tracks.push({ clips: artClips });
  tracks.push({ clips: cardClips });
  tracks.push({ clips: [endCard] });
  tracks.push({ clips: [bg] });

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
