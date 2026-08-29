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
