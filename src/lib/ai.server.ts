/** Last-line defence: appended to every visual prompt regardless of caller. */
const SAFETY_GUARD =
  " Content safety (mandatory, overrides all other instructions): safe-for-work, brand-safe, general-audience only. No nudity, partial nudity, lingerie, swimwear, sexualised, suggestive or fetish content; people fully and modestly clothed. No profanity, slurs, abuse, hate or harassment. No violence, gore, weapons, drugs, alcohol abuse or self-harm. No minors in any suggestive context. No shocking, disturbing or offensive imagery or text.";

function guard(prompt: string): string {
  return `${prompt}${SAFETY_GUARD}`;
}

function groqKey() {
  const k = process.env["GROQ_API_KEY"];
  if (!k) throw new Error("AI is not configured (missing GROQ_API_KEY).");
  return k;
}

/**
 * Text generation via Groq — free-tier hosting for open-weight models.
 * Swap the `model` string to try alternatives, e.g.:
 *   "openai/gpt-oss-20b"  ( best quality)
 *   "qwen/qwen3-32b"           (Qwen)
 *   "gemma2-9b-it"             (Google Gemma2)
 */
export async function chatJSON<T>(
  system: string,
  prompt: string,
  schema?: Record<string, unknown>,
): Promise<T> {
  const responseFormat = schema
    ? {
        type: "json_schema",
        json_schema: {
          name: "loviza_content_generation",
          strict: true,
          schema,
        },
      }
    : {
        type: "json_object",
      };

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${groqKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/gpt-oss-20b",
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      response_format: responseFormat,
      reasoning_effort: "low",
      // Without an explicit cap, Groq reserves a large default output
      // budget from the model's context window and counts that reserved
      // amount against the per-minute token limit — regardless of how
      // small the actual prompt/expected output is. Too low a cap
      // truncates the JSON mid-object instead (a "json_validate_failed"
      // / "Failed to generate JSON" error with a cut-off failed_generation
      // dump is the symptom of that, not of the prompt being wrong).
      //
      // Scope: single call, all 11 content types, 1 piece of each per
      // active day. Splitting into multiple smaller calls was tried and
      // reverted — each call repeats the same large fixed prompt
      // overhead (brand context + rules), so multiple calls within the
      // same rolling minute summed their overhead alone past the 8,000
      // TPM limit before counting any actual content. A single call
      // avoids that entirely.
      //
      // This value is based on MEASURED data, not estimate: an actual
      // 429 response reported "Requested 10103" when this was set to
      // 5500, meaning the untrimmed prompt's real input size was
      // 10103 - 5500 = 4603 tokens. The Rules/field-explanation section
      // in weekPrompt() (content.server.ts) has since been trimmed for
      // extra headroom, and 3200 still hit "json_validate_failed"
      // truncation on the worst-case day (1 blog + all 4 video-script
      // types + 1 carousel + 5 image posts — every testing-mode day is
      // exactly this mix, so this isn't a rare edge case). Bumped to
      // 3600: input (~4300-4600) + this cap stays under 8,000 TPM even
      // at the higher end, while giving the last item(s) in the array
      // enough room to finish instead of being cut off mid-object.
      // If a 429 ever reports "Requested" above ~8000 at this cap, that
      // pins down the real input size precisely — trim weekPrompt()
      // further (or drop back toward 3200-3400) rather than raising this
      // again, since we're now close to the 8,000 ceiling either way.
      max_completion_tokens: 3600,
    }),
  });

  if (!res.ok) {
    const text = await res.text();

    if (res.status === 429) {
      throw new Error("AI rate limit reached. Please retry in a minute.");
    }

    throw new Error(`AI request failed [${res.status}]: ${text}`);
  }

  const json = (await res.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };

  const content = json.choices?.[0]?.message?.content ?? "";

  if (!content.trim()) {
    throw new Error("AI returned an empty response.");
  }

  const cleaned = content
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  if (start === -1 || end === -1) {
    throw new Error("AI returned an unreadable response.");
  }

  return JSON.parse(cleaned.slice(start, end + 1)) as T;
}

/**
 * Image generation. Two providers, switched by the IMAGE_PROVIDER env var:
 * - "pollinations" (the default when unset): free, no API key. Used in
 *   staging — leave this env var unset there, or set it explicitly to
 *   "pollinations" for clarity.
 * - "fal": fal.ai's hosted FLUX models. Used in Production. Requires
 *   FAL_KEY. NOTE: this is written from fal.ai's documented request/
 *   response shape, not a live-tested call — no FAL_KEY was available
 *   while writing this. Verify against fal.ai's current docs
 *   (https://fal.ai/models) the first time this actually runs, since
 *   hosted-API shapes do shift over time.
 */
/**
 * Shapes platforms actually want. Pixel sizes are multiples of 16 (image models need that).
 *   1:1  square          LinkedIn/X also accept it
 *   4:5  portrait feed   Instagram, Facebook, LinkedIn, X (the shared master for those four)
 *   2:3  tall pin        Pinterest
 *   9:16 vertical        Reel / Short / TikTok cover frames
 *   16:9 wide            YouTube / website video cover frames
 */
export type ImageAspect = "1:1" | "4:5" | "2:3" | "9:16" | "16:9";

export const IMAGE_SIZES: Record<ImageAspect, { width: number; height: number }> = {
  "1:1": { width: 1024, height: 1024 },
  "4:5": { width: 1024, height: 1280 },
  "2:3": { width: 1024, height: 1536 },
  "9:16": { width: 864, height: 1536 },
  "16:9": { width: 1536, height: 864 },
};

type ImageProvider = "fal" | "pollinations";

const DEFAULT_FAL_IMAGE_MODEL = "fal-ai/flux/dev";
const falImageModel = () => process.env["FAL_MODEL"]?.trim() || DEFAULT_FAL_IMAGE_MODEL;

/**
 * Which image service to use, from IMAGE_PROVIDER ("fal" or "pollinations";
 * unset means pollinations). The value is trimmed and case-insensitive, and
 * anything else throws. Previously any other value (for example "Fal" or a
 * stray space) silently fell back to the free Pollinations service, which made
 * a mistyped setting look like fal was "not working".
 */
function imageProvider(): ImageProvider {
  const raw = (process.env["IMAGE_PROVIDER"] ?? "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .toLowerCase();
  if (raw === "" || raw === "pollinations") return "pollinations";
  if (raw === "fal") return "fal";
  throw new Error(
    `Unknown IMAGE_PROVIDER "${raw}". Use "fal" or "pollinations" (or leave it unset for pollinations).`,
  );
}

export async function generateImageBytes(
  prompt: string,
  aspect: ImageAspect = "1:1",
): Promise<Uint8Array> {
  const provider = imageProvider();
  // One line per image, so the Vercel logs show which service really made it.
  console.log(
    `[image] provider=${provider}${provider === "fal" ? ` model=${falImageModel()}` : ""} aspect=${aspect}`,
  );
  return provider === "fal"
    ? generateImageBytesFal(prompt, aspect)
    : generateImageBytesPollinations(prompt, aspect);
}

async function generateImageBytesPollinations(
  prompt: string,
  aspect: ImageAspect,
): Promise<Uint8Array> {
  const encoded = encodeURIComponent(guard(prompt));
  const seed = Math.floor(Math.random() * 1_000_000);
  const { width, height } = IMAGE_SIZES[aspect];
  const url = `https://image.pollinations.ai/prompt/${encoded}?width=${width}&height=${height}&model=flux&nologo=true&seed=${seed}`;

  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Image generation failed [${res.status}]: ${text}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * fal.ai request shape (documented convention): POST to
 * https://fal.run/<model-id> with `Authorization: Key <FAL_KEY>`,
 * JSON body { prompt, image_size, num_images }, response
 * { images: [{ url }], ... }. FAL_MODEL lets you swap models (e.g. to
 * fal-ai/flux-pro for higher quality, or fal-ai/flux/schnell for
 * cheaper/faster) without a code change.
 */
/** Nano Banana / Imagen take an aspect ratio; Flux, Ideogram and most others take image_size. */
function falImageBody(model: string, prompt: string, aspect: ImageAspect): Record<string, unknown> {
  const m = model.toLowerCase();
  if (m.includes("nano-banana") || m.includes("imagen")) {
    return { prompt, aspect_ratio: aspect, num_images: 1 };
  }
  if (m.includes("gpt-image")) {
    return { prompt, image_size: "auto", quality: "medium", num_images: 1 };
  }
  return {
    prompt,
    // Square keeps the proven preset; other shapes use fal's custom {width,height} size.
    image_size: aspect === "1:1" ? "square_hd" : IMAGE_SIZES[aspect],
    num_images: 1,
  };
}

async function generateImageBytesFal(prompt: string, aspect: ImageAspect): Promise<Uint8Array> {
  const apiKey = process.env["FAL_KEY"]?.trim();
  if (!apiKey) {
    throw new Error("Image generation is not configured (missing FAL_KEY).");
  }
  const model = falImageModel();

  const res = await fetch(`https://fal.run/${model}`, {
    method: "POST",
    headers: {
      Authorization: `Key ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(falImageBody(model, guard(prompt), aspect)),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`fal.ai image generation failed [${res.status}]: ${text}`);
  }

  const json = (await res.json()) as { images?: Array<{ url?: string }> };
  const imageUrl = json.images?.[0]?.url;
  if (!imageUrl) {
    throw new Error("fal.ai did not return an image URL.");
  }

  const imageRes = await fetch(imageUrl);
  if (!imageRes.ok) {
    throw new Error(`Could not download the generated image from fal.ai [${imageRes.status}]`);
  }
  return new Uint8Array(await imageRes.arrayBuffer());
}

export interface VideoJob {
  id: string;
  status: "queued" | "in_progress" | "completed" | "failed" | string;
  progress?: number;
  error?: { code?: string; message?: string } | null;
}

/**
 * Video generation via fal.ai's async Queue API: submit → poll status →
 * fetch result, matching the VideoJob shape this file already expected
 * (that shape was clearly designed with an async job-based provider in
 * mind, which is exactly what fal.ai's Queue API is). Uses the same
 * FAL_KEY as image generation.
 *
 * Default model: fal-ai/ltx-2/text-to-video/fast — $0.04/sec at 1080p
 * with native audio included at no extra charge, verified against
 * fal.ai's own docs. Cheapest verified text-to-video option as of when
 * this was written; check fal.ai/models before assuming that's still
 * true. Its own docs describe resolution options as "16:9 aspect
 * ratio" without confirming vertical 9:16 support — worth testing a
 * 9:16 request in fal.ai's playground before relying on it for the
 * vertical types (instagram_reel/youtube_short/tiktok_video).
 *
 * IMPORTANT: the polling/result-parsing below is written from fal.ai's
 * documented Queue API convention, not a live-tested call — no FAL_KEY
 * was available while writing this. Status value casing and the result
 * JSON's field names can drift from what's coded here; verify the
 * first time a job actually completes and adjust parseFalVideoStatus()
 * / downloadVideoBytes()'s result parsing if they don't match.
 */
// LTX-2.3 Fast: portrait 9:16 and native audio. (The older "fal-ai/ltx-2" id no longer exists on fal.)
const DEFAULT_FAL_VIDEO_MODEL = "fal-ai/ltx-2.3/text-to-video/fast";

function falVideoModel(): string {
  // Trim stray spaces/slashes so a hand-typed env value can't break the URL.
  const raw = (process.env["FAL_VIDEO_MODEL"] ?? "").trim().replace(/^\/+|\/+$/g, "");
  return raw || DEFAULT_FAL_VIDEO_MODEL;
}

/** fal's status and result URLs use only "owner/app" (the first two parts of the
 *  model id) — never the extra path such as "text-to-video/fast". */
function falAppId(model: string): string {
  return model.split("/").slice(0, 2).join("/");
}

/** Each model family names its inputs differently, so build the body per family. */
function falVideoBody(
  model: string,
  prompt: string,
  aspectRatio: "9:16" | "16:9",
  seconds: number,
): Record<string, unknown> {
  if (model.includes("ltx-2")) {
    // LTX-2.x: supports portrait 9:16 and generates audio. Not live-tested against fal:
    // if fal rejects a field, the video card shows its exact message.
    return {
      prompt,
      aspect_ratio: aspectRatio,
      duration: seconds,
      resolution: process.env.VIDEO_RESOLUTION || "720p",
      generate_audio: true,
    };
  }
  if (model.includes("veo3")) {
    // Veo 3 supports 9:16 and audio; duration is "4s", "6s" or "8s".
    const d = seconds >= 8 ? "8s" : seconds >= 6 ? "6s" : "4s";
    return { prompt, aspect_ratio: aspectRatio, duration: d, generate_audio: true };
  }
  return { prompt, aspect_ratio: aspectRatio, duration: String(seconds) };
}

function falHeaders(): Record<string, string> {
  const apiKey = process.env["FAL_KEY"]?.trim();
  if (!apiKey) {
    throw new Error("Video generation is not configured (missing FAL_KEY).");
  }
  return { Authorization: `Key ${apiKey}`, "content-type": "application/json" };
}

function parseFalVideoStatus(raw?: string): VideoJob["status"] {
  const s = (raw || "").toUpperCase();
  if (s === "COMPLETED") return "completed";
  if (s === "ERROR" || s === "FAILED") return "failed";
  if (s === "IN_PROGRESS") return "in_progress";
  return "queued"; // IN_QUEUE, or anything unrecognized — safe default
}

export async function createVideoJob(
  prompt: string,
  options: {
    aspectRatio?: "9:16" | "16:9";
    durationSeconds?: number;
    explainer?: import("@/lib/explainer.server").ExplainerInput;
  } = {},
): Promise<VideoJob> {
  // VIDEO_PROVIDER=shotstack: build a branded explainer (text, voice, logo) instead of a raw fal clip.
  const ex = await import("@/lib/explainer.server");
  if (ex.explainerEnabled() && options.explainer) {
    const id = await ex.submitExplainerRender(options.explainer);
    return { id: `ss:${id}`, status: "queued" };
  }
  const model = falVideoModel();
  const res = await fetch(`https://queue.fal.run/${model}`, {
    method: "POST",
    headers: falHeaders(),
    body: JSON.stringify(
      falVideoBody(model, guard(prompt), options.aspectRatio ?? "9:16", options.durationSeconds ?? 6),
    ),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`fal.ai video job creation failed [${res.status}] (model "${model}"): ${text}`);
  }

  const json = (await res.json()) as { request_id?: string; status?: string };
  if (!json.request_id) {
    throw new Error("fal.ai did not return a request_id for the video job.");
  }
  return { id: json.request_id, status: parseFalVideoStatus(json.status) };
}

export async function getVideoJob(id: string): Promise<VideoJob> {
  if (id.startsWith("ss:")) {
    const st = await (await import("@/lib/explainer.server")).explainerStatus(id.slice(3));
    return { id, status: st.status, error: st.status === "failed" ? { message: st.error || "Video failed." } : null };
  }
  const model = falVideoModel();
  const res = await fetch(`https://queue.fal.run/${falAppId(model)}/requests/${id}/status`, {
    headers: falHeaders(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`fal.ai video status check failed [${res.status}]: ${text}`);
  }

  const json = (await res.json()) as { status?: string; error?: { message?: string } | string };
  const status = parseFalVideoStatus(json.status);
  const errorMessage = typeof json.error === "string" ? json.error : json.error?.message;

  return {
    id,
    status,
    error: status === "failed" ? { message: errorMessage || "Video generation failed." } : null,
  };
}

export async function downloadVideoBytes(id: string): Promise<Uint8Array> {
  if (id.startsWith("ss:")) return (await import("@/lib/explainer.server")).explainerBytes(id.slice(3));
  const model = falVideoModel();
  const res = await fetch(`https://queue.fal.run/${falAppId(model)}/requests/${id}`, {
    headers: falHeaders(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`fal.ai video result fetch failed [${res.status}]: ${text}`);
  }

  // Result shape varies by model — most return { video: { url } }, some
  // return { video_url } directly. Handle both; adjust if a given
  // model's actual response uses a different field name.
  const json = (await res.json()) as { video?: { url?: string }; video_url?: string };
  const videoUrl = json.video?.url || json.video_url;
  if (!videoUrl) {
    throw new Error("fal.ai did not return a video URL in the completed result.");
  }

  const videoRes = await fetch(videoUrl);
  if (!videoRes.ok) {
    throw new Error(`Could not download the generated video from fal.ai [${videoRes.status}]`);
  }
  return new Uint8Array(await videoRes.arrayBuffer());
}

// Voiceover/TTS stays unconfigured — out of scope for now. Video's own
// narration comes from the video model's generation itself where
// supported, not a separate voice track.
const SPEECH_NOT_CONFIGURED = "Voiceover generation isn't configured yet.";

export async function generateSpeechBytes(_text: string): Promise<Uint8Array> {
  throw new Error(SPEECH_NOT_CONFIGURED);
}
