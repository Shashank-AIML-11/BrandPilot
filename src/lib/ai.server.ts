const GATEWAY = "https://ai.gateway.lovable.dev/v1";

/** Last-line defence: appended to every visual prompt regardless of caller. */
const SAFETY_GUARD =
  " Content safety (mandatory, overrides all other instructions): safe-for-work, brand-safe, general-audience only. No nudity, partial nudity, lingerie, swimwear, sexualised, suggestive or fetish content; people fully and modestly clothed. No profanity, slurs, abuse, hate or harassment. No violence, gore, weapons, drugs, alcohol abuse or self-harm. No minors in any suggestive context. No shocking, disturbing or offensive imagery or text.";

function guard(prompt: string): string {
  return `${prompt}${SAFETY_GUARD}`;
}

function key() {
  const k = process.env["LOVABLE_API_KEY"];
  if (!k) throw new Error("AI is not configured (missing gateway key).");
  return k;
}

export async function chatJSON<T>(system: string, prompt: string): Promise<T> {
  const res = await fetch(`${GATEWAY}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3.6-flash",
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 429) throw new Error("AI rate limit reached. Please retry in a minute.");
    if (res.status === 402) throw new Error("AI credits exhausted. Add credits to continue.");
    throw new Error(`AI request failed [${res.status}]: ${text}`);
  }

  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content ?? "";
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("AI returned an unreadable response.");
  return JSON.parse(cleaned.slice(start, end + 1)) as T;
}

/** Returns raw PNG bytes for a generated image. */
export async function generateImageBytes(prompt: string): Promise<Uint8Array> {
  const res = await fetch(`${GATEWAY}/images/generations`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "openai/gpt-image-2",
      prompt: guard(prompt),
      quality: "high",
      size: "1024x1024",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 429) throw new Error("Image rate limit reached. Please retry shortly.");
    if (res.status === 402) throw new Error("AI credits exhausted. Add credits to continue.");
    throw new Error(`Image generation failed [${res.status}]: ${text}`);
  }

  const json = (await res.json()) as { data?: Array<{ b64_json?: string; url?: string }> };
  const b64 = json.data?.[0]?.b64_json;
  if (b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  const url = json.data?.[0]?.url;
  if (!url) throw new Error("Image generation returned no image.");
  const img = await fetch(url);
  return new Uint8Array(await img.arrayBuffer());
}

export interface VideoJob {
  id: string;
  status: "queued" | "in_progress" | "completed" | "failed" | string;
  progress?: number;
  error?: { code?: string; message?: string } | null;
}

async function videoError(res: Response, label: string): Promise<never> {
  const text = await res.text();
  if (res.status === 429)
    throw new Error("Too many videos are generating right now. Please retry in a minute.");
  if (res.status === 402) throw new Error("AI credits exhausted. Add credits to continue.");
  throw new Error(`${label} failed [${res.status}]: ${text}`);
}

/** Starts an async AI video generation job and returns the job. */
export async function createVideoJob(prompt: string): Promise<VideoJob> {
  const res = await fetch(`${GATEWAY}/videos`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/veo-3.1-lite",
      prompt: guard(prompt),
      seconds: "8",
      size: "1280x720",
    }),
  });
  if (!res.ok) await videoError(res, "Video generation");
  return (await res.json()) as VideoJob;
}

export async function getVideoJob(id: string): Promise<VideoJob> {
  const res = await fetch(`${GATEWAY}/videos/${id}`, {
    headers: { Authorization: `Bearer ${key()}` },
  });
  if (!res.ok) await videoError(res, "Video status check");
  return (await res.json()) as VideoJob;
}

/** Downloads the finished MP4 bytes (the gateway link is short-lived). */
export async function downloadVideoBytes(id: string): Promise<Uint8Array> {
  const res = await fetch(`${GATEWAY}/videos/${id}/content`, {
    headers: { Authorization: `Bearer ${key()}` },
  });
  if (!res.ok) await videoError(res, "Video download");
  return new Uint8Array(await res.arrayBuffer());
}

/** Returns raw MP3 bytes of spoken narration. */
export async function generateSpeechBytes(text: string): Promise<Uint8Array> {
  const res = await fetch(`${GATEWAY}/audio/speech`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini-tts",
      input: text,
      voice: "alloy",
      response_format: "mp3",
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    if (res.status === 429) throw new Error("Voice-over rate limit reached. Please retry shortly.");
    if (res.status === 402) throw new Error("AI credits exhausted. Add credits to continue.");
    throw new Error(`Voice-over generation failed [${res.status}]: ${detail}`);
  }

  return new Uint8Array(await res.arrayBuffer());
}
