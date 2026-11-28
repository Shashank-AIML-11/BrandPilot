/**
 * Spoken-language support for reels. A reel is spoken in ONE language; the on-screen text can stay
 * English (the normal way Hindi reels look on Instagram and Facebook). In a Hindi voice-over, words
 * that Hindi speakers already say in English (table, phone, order, delivery...) stay in English,
 * written in Latin letters inside the Devanagari sentence so the voice pronounces them naturally.
 *
 * Voices: Shotstack offers ElevenLabs (no native Hindi voice), MiniMax and Amazon Polly. For Hindi the
 * default is Polly neural "Kajal", an Indian bilingual Hindi/English voice. Override per language with
 *   SHOTSTACK_VOICE_HI="model:voice[:language]"  e.g. "polly-neural:Kajal:hi-IN" or
 *   "elevenlabs-multilingual-v2:Rachel"
 * Turn the feature off with VIDEO_MULTILANG=off.
 */

export type SpokenLang = "en" | "hi";

export interface VoiceSpec {
  model: string;
  voice: string | undefined;
  language?: string;
}

const NAMES: Array<[SpokenLang | "other", RegExp]> = [
  ["hi", /hindi|hinglish|हिन्दी|हिंदी/i],
  ["en", /english/i],
];

/** Which supported spoken languages a free-text "languages" profile field mentions. */
export function spokenLanguagesOf(text: string | null | undefined): SpokenLang[] {
  const out: SpokenLang[] = [];
  for (const [code, re] of NAMES) if (code !== "other" && re.test(String(text ?? ""))) out.push(code);
  return out;
}

const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

export function multiLangEnabled(): boolean {
  return (process.env["VIDEO_MULTILANG"] ?? "on").trim().toLowerCase() !== "off";
}

/** The language one reel is spoken in: English unless the brand's audience speaks Hindi, then it alternates. */
export function pickVideoLanguage(brandLanguages: string | null | undefined, seed: string): SpokenLang {
  if (!multiLangEnabled()) return "en";
  const langs = spokenLanguagesOf(brandLanguages);
  if (!langs.includes("hi")) return "en";
  if (!langs.includes("en")) return "hi"; // Hindi only
  return hash(seed) % 2 === 0 ? "hi" : "en";
}

/** Model, voice and language code for the voice-over of a spoken language. */
export function voiceSpecFor(lang: SpokenLang): VoiceSpec {
  const env = lang === "hi" ? process.env["SHOTSTACK_VOICE_HI"]?.trim() : "";
  if (env) {
    const [model, voice, language] = env.includes(":") ? env.split(":").map((x) => x.trim()) : ["elevenlabs-multilingual-v2", env];
    return { model: model || "elevenlabs-multilingual-v2", voice: voice || undefined, ...(language ? { language } : {}) };
  }
  if (lang === "hi") return { model: "polly-neural", voice: "Kajal", language: "hi-IN" };
  return { model: "elevenlabs-multilingual-v2", voice: process.env["SHOTSTACK_VOICE"]?.trim() || undefined };
}

/**
 * English words Hindi speakers use as they are, every day, across homes, shops, money, school, work,
 * transport, technology and social media. Kept in English inside Hindi lines; never translated into
 * formal ("shuddh") Hindi. Compiled from published loanword lists (Hindi Diwas lists, HindiPod101, Britannica).
 */
export const HINDI_KEEP_ENGLISH: string[] = [
  // home and shop
  "table", "chair", "sofa", "bed", "fan", "light", "lamp", "kitchen", "bathroom", "door", "window", "bottle", "glass", "plate", "box", "bag", "gift", "decor", "design", "style", "fashion", "size", "colour", "collection", "shop", "store", "market", "mall", "brand", "quality", "packing", "pack", "set",
  // money and buying
  "price", "offer", "discount", "sale", "free", "cash", "card", "bill", "bank", "account", "payment", "UPI", "order", "delivery", "return", "refund", "COD", "budget", "profit", "loss", "rate", "GST", "EMI", "ticket",
  // work, school, health
  "office", "meeting", "manager", "boss", "team", "plan", "project", "business", "customer", "client", "service", "school", "college", "class", "exam", "teacher", "doctor", "hospital", "clinic", "medicine", "test", "report",
  // tech and social
  "phone", "mobile", "online", "offline", "app", "website", "link", "internet", "WiFi", "TV", "video", "reel", "post", "photo", "like", "share", "comment", "follow", "subscribe", "WhatsApp", "Instagram", "Facebook", "YouTube", "message", "call", "email", "password", "download", "update",
  // transport and public
  "bus", "train", "station", "taxi", "car", "bike", "petrol", "police", "court", "hotel", "restaurant", "cafe", "party", "wedding", "festival", "gate", "road",
  // everyday talk
  "time", "number", "problem", "solution", "tip", "idea", "easy", "simple", "best", "super", "special", "perfect", "ready", "ok", "sorry", "thanks", "please", "trick", "secret", "hack",
];

/** Writing rules for a Hindi voice-over, from TTS best practice and how Hindi reels actually sound. */
export const HINDI_VOICE_RULES = `HINDI VOICE-OVER RULES (the "voice" field of every scene):
- Write each voice line in Hindi in Devanagari script, spoken the way a friendly North Indian person talks to a friend or customer: warm, conversational, simple everyday Hindi. Never textbook, formal or Sanskritised Hindi ("shuddh Hindi").
- Address the viewer as "आप" (polite) unless the brand's tone is clearly casual youth, then "तुम"/"यार" is fine.
- Words Hindi speakers already say in English stay in English, written in Latin letters inside the Devanagari sentence (for example: table, chair, phone, order, delivery, discount, offer, price, online, reel, WhatsApp). Do NOT translate them into pure Hindi. Common ones: ${HINDI_KEEP_ENGLISH.slice(0, 70).join(", ")} and similar everyday borrowed words.
- Brand names, product names, places, prices and the website stay in Latin letters exactly as given. Write amounts as digits ("999 रुपये" or "Rs 999").
- Short, complete sentences, at most 12 words. End a sentence with "।" after Hindi and "." after an English word. Use commas for natural pauses and "!" only for real emphasis. Do not use "..." or emoji.
- Vary the delivery like a person would: an open hook line with energy and a question or surprise, calm explaining lines in the middle, a warm, confident call to action at the end.
- Everything that appears ON SCREEN (title, sub, items, stats, a, b) stays in plain English, saying the same thing as the voice line. Only the "voice" field is Hindi.`;
