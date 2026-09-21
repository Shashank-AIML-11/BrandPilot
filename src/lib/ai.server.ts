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
export async function generateImageBytes(prompt: string): Promise<Uint8Array> {
  const provider = process.env["IMAGE_PROVIDER"] || "pollinations";
  return provider === "fal" ? generateImageBytesFal(prompt) : generateImageBytesPollinations(prompt);
}

async function generateImageBytesPollinations(prompt: string): Promise<Uint8Array> {
  const encoded = encodeURIComponent(guard(prompt));
  const seed = Math.floor(Math.random() * 1_000_000);
  const url = `https://image.pollinations.ai/prompt/${encoded}?width=1024&height=1024&model=flux&nologo=true&seed=${seed}`;

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
async function generateImageBytesFal(prompt: string): Promise<Uint8Array> {
  const apiKey = process.env["FAL_KEY"];
  if (!apiKey) {
    throw new Error("Image generation is not configured (missing FAL_KEY).");
  }
  const model = process.env["FAL_MODEL"] || "fal-ai/flux/dev";

  const res = await fetch(`https://fal.run/${model}`, {
    method: "POST",
    headers: {
      Authorization: `Key ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      prompt: guard(prompt),
      image_size: "square_hd",
      num_images: 1,
    }),
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
const DEFAULT_FAL_VIDEO_MODEL = "fal-ai/ltx-2/text-to-video/fast";

function falVideoModel(): string {
  return process.env["FAL_VIDEO_MODEL"] || DEFAULT_FAL_VIDEO_MODEL;
}

function falHeaders(): Record<string, string> {
  const apiKey = process.env["FAL_KEY"];
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
  options: { aspectRatio?: "9:16" | "16:9"; durationSeconds?: number } = {},
): Promise<VideoJob> {
  const model = falVideoModel();
  const res = await fetch(`https://queue.fal.run/${model}`, {
    method: "POST",
    headers: falHeaders(),
    body: JSON.stringify({
      prompt: guard(prompt),
      aspect_ratio: options.aspectRatio ?? "9:16",
      duration: String(options.durationSeconds ?? 5),
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`fal.ai video job creation failed [${res.status}]: ${text}`);
  }

  const json = (await res.json()) as { request_id?: string; status?: string };
  if (!json.request_id) {
    throw new Error("fal.ai did not return a request_id for the video job.");
  }
  return { id: json.request_id, status: parseFalVideoStatus(json.status) };
}

export async function getVideoJob(id: string): Promise<VideoJob> {
  const model = falVideoModel();
  const res = await fetch(`https://queue.fal.run/${model}/requests/${id}/status`, {
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
  const model = falVideoModel();
  const res = await fetch(`https://queue.fal.run/${model}/requests/${id}`, {
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
