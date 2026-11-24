/**
 * Hard content-safety gate. The prompts already ask the AI to stay safe; this module
 * CHECKS what actually came back, before it is saved or posted. Server-only.
 *
 * Two layers:
 *  1. A local blocklist (instant, free, cannot be talked around by a prompt).
 *  2. A moderation model on Groq (Llama Guard by default; set SAFETY_MODEL to change it,
 *     or SAFETY_MODERATION=off to switch this layer off). If the model cannot be reached the
 *     local layer still applies and the error is logged (the content is not silently approved
 *     by the model layer, but the pipeline is not stopped by an outage either).
 */

export interface SafetyVerdict {
  ok: boolean;
  /** Short, user-safe reason, e.g. "sexual content". Never echoes the offending text. */
  reason?: string;
  layer?: "local" | "model";
}

interface Rule {
  reason: string;
  pattern: RegExp;
}

// Whole-word patterns. Kept to unambiguous terms so normal marketing copy is never blocked.
const RULES: Rule[] = [
  {
    reason: "sexual content",
    pattern:
      /\b(porn\w*|nude|nudes|naked|topless|nsfw|erotic\w*|xxx|onlyfans|lingerie|stripper|strip\s?tease|sex\s?tape|sexual(?:ly)?\s+explicit|blow\s?job|orgasm|fetish\w*|hentai|escort\s+service)\b/i,
  },
  {
    reason: "profanity or abuse",
    pattern:
      /\b(fuck\w*|shit\w*|bitch\w*|bastard|asshole|dickhead|motherfucker|cunt|bullshit|piss\s?off|wtf|stfu)\b/i,
  },
  {
    reason: "hate or discrimination",
    pattern:
      /\b(nigg\w+|faggot|retard(?:ed)?|kike|spic|chink|paki|towelhead|tranny|white\s+power|heil\s+hitler|race\s+war|ethnic\s+cleansing|subhuman)\b/i,
  },
  {
    reason: "violence or weapons",
    pattern:
      /\b(gore|gory|beheading|mass\s+shooting|school\s+shooting|how\s+to\s+(?:make|build)\s+(?:a\s+)?(?:bomb|explosive|gun|weapon)|bomb\s+making|terroris[tm]|massacre|torture|murder(?:ed|ing)?\s+(?:him|her|them)|kill\s+(?:him|her|them|everyone|all))\b/i,
  },
  {
    reason: "self-harm",
    pattern:
      /\b(kill\s+yourself|kys|suicide\s+(?:method|note|plan)|how\s+to\s+(?:commit\s+suicide|self[-\s]?harm)|cut\s+yourself|end\s+your\s+life|self[-\s]?harm)\b/i,
  },
  {
    reason: "illegal drugs",
    pattern:
      /\b(cocaine|heroin|meth(?:amphetamine)?|crack\s+cocaine|lsd|mdma|ecstasy|fentanyl|buy\s+(?:weed|drugs|marijuana)|drug\s+dealer|darknet\s+market)\b/i,
  },
  {
    reason: "gambling or adult-only offers",
    pattern: /\b(online\s+casino|sports\s*betting|bet\s+now|slot\s+machines?|jackpot\s+win|poker\s+bonus|adult\s+dating)\b/i,
  },
  {
    reason: "minors in a sexual or unsafe context",
    pattern:
      /\b(underage\s+(?:sex|girl|boy|nude)|child\s+(?:porn|nude|abuse)|loli\w*|teen\s+(?:sex|nude|porn))\b/i,
  },
  {
    reason: "scam or misleading claims",
    pattern:
      /\b(guaranteed\s+(?:cure|returns?\s+of\s+\d+|profit)|get\s+rich\s+quick|double\s+your\s+money|miracle\s+cure|cure[sd]?\s+cancer|100%\s+risk[-\s]?free)\b/i,
  },
];

/** Flattens every text value of an object (or the text itself) into one string to scan. */
export function collectText(value: unknown, depth = 0): string {
  if (value == null || depth > 4) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((v) => collectText(v, depth + 1)).join("\n");
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .filter(([k]) => !/(^id$|_id$|url|path|date|time|status|type|created|updated)/i.test(k))
      .map(([, v]) => collectText(v, depth + 1))
      .join("\n");
  }
  return "";
}

/** Layer 1: instant local check. */
export function screenLocal(text: string): SafetyVerdict {
  const hay = text.normalize("NFKC").replace(/[​-‍﻿]/g, "");
  for (const rule of RULES) {
    if (rule.pattern.test(hay)) return { ok: false, reason: rule.reason, layer: "local" };
  }
  return { ok: true };
}

/** Layer 2: moderation model. Returns ok=true when the model is off or unreachable. */
export async function screenWithModel(text: string): Promise<SafetyVerdict> {
  if ((process.env["SAFETY_MODERATION"] ?? "on").trim().toLowerCase() === "off") return { ok: true };
  // Same provider switch as the text generator: TEXT_PROVIDER=openrouter means Groq is never called.
  const openrouter = (process.env["TEXT_PROVIDER"] ?? "").trim().toLowerCase() === "openrouter";
  const key = openrouter ? process.env["OPENROUTER_API_KEY"] : process.env["GROQ_API_KEY"];
  if (!key || !text.trim()) return { ok: true };
  const model = (process.env["SAFETY_MODEL"] || "meta-llama/llama-guard-4-12b").trim();
  try {
    const res = await fetch(openrouter ? "https://openrouter.ai/api/v1/chat/completions" : "https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [{ role: "user", content: text.slice(0, 12000) }],
      }),
    });
    if (!res.ok) {
      console.error(`[safety] moderation model unavailable [${res.status}]`);
      return { ok: true };
    }
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const out = (json.choices?.[0]?.message?.content ?? "").trim().toLowerCase();
    if (out.startsWith("unsafe")) return { ok: false, reason: "flagged by the safety model", layer: "model" };
    return { ok: true };
  } catch (e) {
    console.error("[safety] moderation model error", e instanceof Error ? e.message : e);
    return { ok: true };
  }
}

/** Runs both layers over any value (string, row, array). */
export async function checkContentSafety(value: unknown): Promise<SafetyVerdict> {
  const text = collectText(value);
  if (!text.trim()) return { ok: true };
  const local = screenLocal(text);
  if (!local.ok) return local;
  return screenWithModel(text);
}
