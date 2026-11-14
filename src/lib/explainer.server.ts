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

export interface ExplainerInput {
  item: { id: string; title?: string | null; summary?: string | null; image_prompt?: string | null };
  brandName: string;
  website: string;
  colors?: { primary?: string; secondary?: string; accent?: string } | null;
  logoUrl?: string | null; // public/signed URL
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

/** Scene text + the spoken script, kept short so voice and scenes stay in sync. */
export function explainerPlan(input: ExplainerInput) {
  const copy = posterCopyFor(input.item, { website: input.website });
  const points = copy.points.length ? copy.points : [copy.subline].filter(Boolean);
  const narration = [copy.headline, ...points, copy.cta]
    .map((t) => t.replace(/[.!?]+$/, ""))
    .join(". ") + ".";
  return { headline: copy.headline, points: points.slice(0, 3), cta: copy.cta, narration };
}

function sceneHtml(inner: string, css: string) {
  return {
    type: "html",
    html: inner,
    css: `*{box-sizing:border-box;margin:0;padding:0}body{width:${W}px;height:${H}px;font-family:'Montserrat','Open Sans',Arial,sans-serif;display:flex;align-items:center;justify-content:center;text-align:center}${css}`,
    width: W,
    height: H,
  };
}

export function buildTimeline(input: ExplainerInput) {
  const c = input.colors ?? {};
  const primary = cleanColor(c.primary, "#4f46e5");
  const secondary = cleanColor(c.secondary, "#0f172a");
  const accent = cleanColor(c.accent, "#f59e0b");
  const plan = explainerPlan(input);
  const HOOK = 4;
  const PER = 4;
  const CTA = 5;
  const pts = plan.points;
  const total = HOOK + pts.length * PER + CTA;
  const fade = { in: "fade", out: "fade" };

  const bg = {
    asset: sceneHtml("<div></div>", `body{background:linear-gradient(160deg,${secondary},${primary})}`),
    start: 0,
    length: total,
  };

  const scenes: unknown[] = [];
  scenes.push({
    asset: sceneHtml(
      `<div class="w"><div class="k">${esc(input.brandName)}</div><h1>${esc(plan.headline)}</h1></div>`,
      `.w{padding:0 56px}.k{color:${accent};font-weight:700;letter-spacing:4px;text-transform:uppercase;font-size:22px;margin-bottom:22px}h1{color:#fff;font-weight:800;font-size:64px;line-height:1.12}`,
    ),
    start: 0,
    length: HOOK,
    transition: fade,
  });
  pts.forEach((p, i) => {
    scenes.push({
      asset: sceneHtml(
        `<div class="w"><div class="n">${i + 1}</div><h2>${esc(p)}</h2></div>`,
        `.w{padding:0 56px}.n{width:84px;height:84px;border-radius:42px;background:${accent};color:${secondary};font-weight:800;font-size:44px;line-height:84px;margin:0 auto 30px}h2{color:#fff;font-weight:700;font-size:54px;line-height:1.18}`,
      ),
      start: HOOK + i * PER,
      length: PER,
      transition: fade,
    });
  });
  scenes.push({
    asset: sceneHtml(
      `<div class="w"><h2>${esc(plan.headline)}</h2><div class="b">${esc(plan.cta)} &rarr;</div></div>`,
      `.w{padding:0 56px}h2{color:#fff;font-weight:800;font-size:50px;line-height:1.15;margin-bottom:44px}.b{display:inline-block;background:${accent};color:${secondary};font-weight:800;font-size:38px;padding:22px 46px;border-radius:60px}`,
    ),
    start: HOOK + pts.length * PER,
    length: CTA,
    transition: fade,
  });

  const tracks: unknown[] = [];
  // top layer first: logo
  if (input.logoUrl) {
    tracks.push({
      clips: [
        { asset: { type: "image", src: input.logoUrl }, start: 0, length: total, position: "top", offset: { y: -0.06 }, fit: "contain", width: 300, height: 96 },
      ],
    });
  }
  tracks.push({ clips: scenes });
  if ((process.env["EXPLAINER_PHOTOS"] ?? "").toLowerCase() === "on" && input.photoPrompt) {
    tracks.push({
      clips: [
        {
          asset: { type: "image", prompt: input.photoPrompt.slice(0, 600), model: "nano-banana-2", options: { aspectRatio: "9:16" } },
          start: 0,
          length: total,
          opacity: 0.28,
          fit: "cover",
        },
      ],
    });
  }
  tracks.push({ clips: [bg] });

  const voice = process.env["SHOTSTACK_VOICE"]?.trim();
  const soundtrack: Record<string, unknown> = {};
  const audioTracks: unknown[] = [];
  if (voice) {
    audioTracks.push({
      clips: [
        {
          asset: {
            type: "audio",
            prompt: plan.narration,
            model: "elevenlabs-multilingual-v2",
            options: { voice },
          },
          start: 0.4,
          length: "auto",
        },
      ],
    });
  }
  const music = process.env["EXPLAINER_MUSIC_URL"]?.trim();
  if (music) soundtrack["soundtrack"] = { src: music, effect: "fadeOut", volume: 0.15 };

  return {
    timeline: { background: secondary, ...soundtrack, tracks: [...audioTracks, ...tracks] },
    output: { format: "mp4", size: { width: W, height: H } },
  };
}

export async function submitExplainerRender(input: ExplainerInput): Promise<string> {
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
