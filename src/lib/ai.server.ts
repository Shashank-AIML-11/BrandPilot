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
      // Scope as of this change: content-queue.server.ts now batches
      // generation into groups of 4 content types per call (see
      // TYPE_BATCH_SIZE there), not all 11 at once. A 4-item batch's
      // real output need tops out around ~1,600–2,400 tokens (the
      // heaviest batches contain a video type's script or blog's ~300-
      // word body). 2800 leaves solid headroom above that while keeping
      // input (~3,000–3,500 for brand context + rules + a 4-type
      // schema) + this cap safely under Groq's 8,000 TPM free-tier
      // limit. If TYPE_BATCH_SIZE changes, this needs re-tuning to
      // match — smaller batches need a smaller cap, larger batches need
      // a larger one, and either direction risks tipping over 8,000 if
      // left at a value sized for the old batch size.
      max_completion_tokens: 2800,
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
 * Image generation via Pollinations.ai — free, no API key, backed by the
 * open-source FLUX model. Change `model=flux` to `model=turbo` for faster,
 * lower-quality results if needed.
 */
export async function generateImageBytes(prompt: string): Promise<Uint8Array> {
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

export interface VideoJob {
  id: string;
  status: "queued" | "in_progress" | "completed" | "failed" | string;
  progress?: number;
  error?: { code?: string; message?: string } | null;
}

// Video (and voice-over) are not wired to a provider yet — Lovable Gateway
// has been fully removed, and no free equivalent exists for video generation.
// This is fine while video generation stays paused; revisit with a real
// (likely paid, e.g. fal.ai or Replicate) provider once blogs/images are solid.
const VIDEO_NOT_CONFIGURED =
  "Video generation isn't configured yet (Lovable Gateway removed, no replacement set up).";

export async function createVideoJob(_prompt: string): Promise<VideoJob> {
  throw new Error(VIDEO_NOT_CONFIGURED);
}

export async function getVideoJob(_id: string): Promise<VideoJob> {
  throw new Error(VIDEO_NOT_CONFIGURED);
}

export async function downloadVideoBytes(_id: string): Promise<Uint8Array> {
  throw new Error(VIDEO_NOT_CONFIGURED);
}

export async function generateSpeechBytes(_text: string): Promise<Uint8Array> {
  throw new Error(VIDEO_NOT_CONFIGURED);
}
