/**
 * Content quality gate. Server-only.
 *
 * Runs on the freshly written pieces before they are saved:
 *  1. Plain checks (no AI): common AI-sounding phrases, em-dash overuse, a piece that
 *     resembles something posted recently or earlier in the same batch.
 *  2. One editor pass (a single AI call for the whole batch) that scores every piece and
 *     rewrites the weak ones: sharper hook, more specific, more human, same facts.
 *
 * A rewrite is never allowed to bring in a number that is not already in the brand's own
 * information or in the original text. Everything fails soft: if the editor call fails or is
 * slow, the original pieces are saved unchanged (apart from the plain clean-ups).
 *   CONTENT_QUALITY_GATE        "off" switches the editor pass off (default on)
 *   CONTENT_QUALITY_MIN_SCORE   rewrite below this score out of 10 (default 7)
 *   CONTENT_QUALITY_TIMEOUT_MS  longest the editor pass may take (default 25000)
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { chatJSON } from "@/lib/ai.server";
import { occasionLine } from "@/lib/occasions";

type AdminClient = SupabaseClient<Database>;
type Row = Record<string, unknown>;

/** Phrases that make a post read as machine-written. Matched case-insensitively. */
export const AI_CLICHES = [
  "in today's fast-paced world",
  "in today's digital age",
  "in the ever-evolving",
  "ever-evolving",
  "fast-paced world",
  "game-changer",
  "game changer",
  "unlock the power",
  "unlock your",
  "unlock the secret",
  "elevate your",
  "take your .{0,30} to the next level",
  "to the next level",
  "revolutionize",
  "revolutionise",
  "delve into",
  "dive into",
  "dive deep",
  "seamless",
  "cutting-edge",
  "state-of-the-art",
  "unleash",
  "supercharge",
  "look no further",
  "rich tapestry",
  "navigate the",
  "stay tuned",
  "whether you're a",
  "in the world of",
  "embark on",
  "testament to",
  "harness the power",
  "it's no secret that",
  "are you ready to",
  "say goodbye to",
];

const CLICHE_RES = AI_CLICHES.map((p) => new RegExp(p, "i"));

export function clichesIn(text: string): string[] {
  return CLICHE_RES.filter((re) => re.test(text)).map((re) => (text.match(re)?.[0] ?? "").toLowerCase());
}

/** " — " used as a dash is a strong sign of machine writing; use a comma instead. */
export function plainDashes(text: string): string {
  return text.replace(/\s+[—–]\s+/g, ", ").replace(/([a-z0-9])—([a-z0-9])/gi, "$1, $2");
}

const STOP = new Set("a an the and or of to in on for with is are was were be it this that your you we our at as by from not but so if can will just".split(" "));

export function wordSet(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9ऀ-࿿\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w)),
  );
}

/** 0 = nothing in common, 1 = same words. */
export function similarity(a: string, b: string): number {
  const x = wordSet(a);
  const y = wordSet(b);
  if (!x.size || !y.size) return 0;
  let shared = 0;
  for (const w of x) if (y.has(w)) shared += 1;
  return shared / (x.size + y.size - shared);
}

export const SIMILAR_AT = 0.45;

/** Every number in `text` already appears in `allowed` (commas and spaces ignored). */
export function numbersAllowed(text: string, allowed: string): boolean {
  // whole numbers only: "7" is not allowed just because "2027" or "70" appears somewhere in the brand text
  const norm = (s: string) => s.replace(/(\d),(?=\d{3}\b)/g, "$1");
  const facts = new Set(norm(allowed).match(/\d+(?:\.\d+)?/g) ?? []);
  return (norm(text).match(/\d+(?:\.\d+)?/g) ?? []).every((n) => facts.has(n));
}

/** "3 ways", "5 quick tips" count the items of the piece itself, they are not facts about the brand. */
export function withoutListCounts(t: string): string {
  return t.replace(/\b(?:[2-9]|10)\s+(?:(?:quick|simple|easy|key|common|real|big|small|smart|best)\s+)?(?:ways?|tips?|steps?|things?|mistakes?|reasons?|questions?|checks?|myths?|signs?|benefits?|rules?|ideas?|secrets?|habits?|hacks?|facts?|points?|types?)\b/gi, "");
}

const text = (v: unknown) => (typeof v === "string" ? v : "");
const fingerprint = (r: Row) => `${text(r["title"])} ${text(r["caption"]).slice(0, 160)}`;

export interface RuleFinding {
  index: number;
  cliches: string[];
  similarTo: string;
  /** Claims the brand information does not support (invented numbers, customer stories, off-season festivals). */
  claims: string[];
}

const STORY = /\b([Mm]eet [A-Z][a-z]+|went from \d|real stories?|success stor(?:y|ies)|a customer (?:said|told)|one of our (?:customers|clients|students|patients|parents))\b/;
const PLACEHOLDER_RE = /\[(?!(?:HOOK|BODY|CTA)\])[A-Za-z][^\]\n]{0,30}\]/i;
const RISK_RE = /\b(guarantee[ds]?|risk[- ]free|100% (?:safe|natural|effective|secure))\b/i;
// Health and speed promises are never allowed on the brand's say-so: a compliance note that says
// "never promise pain-free" mentions the word too, so the brand text cannot clear them.
const HARD_RISK_RE = /\b(pain[- ]?free|painless(?:ly)?|no pain|zero pain|cures?|instant(?:ly)?|same[- ]day (?:cash|payment|results?)|overnight results?)\b/i;
const FESTIVAL_RE = /diwali|dhanteras|holi\b|christmas|new year|raksha bandhan|rakhi|eid\b|navratri|dussehra|ganesh chaturthi|valentine|black friday|pongal|sankranti|onam|janmashtami|karwa chauth/i;

/** What a piece says that the brand information does not back up. Empty when the piece is clean. */
export function unsupportedClaims(r: Row, brandText: string): string[] {
  const t = `${text(r["title"])} ${text(r["caption"])} ${text(r["video_script"])} ${text(r["body"]).slice(0, 1500)} ${text(r["image_prompt"]).replace(/\|\|?/g, " ")}`;
  const date = text(r["scheduled_date"]);
  const near = date ? occasionLine(date) : "";
  const allowed = `${brandText} ${near} ${date}`;
  const out: string[] = [];
  const nums = [...new Set((withoutListCounts(t).match(/\d+(?:\.\d+)?/g) ?? []).filter((n) => !numbersAllowed(n, allowed)))];
  if (nums.length) out.push(`numbers that are not in the brand information (${nums.join(", ")})`);
  if (!/real customer testimonials supplied/i.test(brandText) && STORY.test(t)) out.push("an invented customer story or result (the brand supplied no testimonials)");
  const ph = t.match(PLACEHOLDER_RE)?.[0];
  if (ph) out.push(`a leftover placeholder (${ph})`);
  const risk = t.match(RISK_RE)?.[1];
  if (risk && !brandText.toLowerCase().includes(risk.toLowerCase())) out.push(`a promise the brand never made (${risk})`);
  const hard = t.match(HARD_RISK_RE)?.[1];
  if (hard) out.push(`a promise the brand cannot make (${hard})`);
  const fest = t.match(FESTIVAL_RE)?.[0];
  if (fest && date && !near.toLowerCase().includes(fest.toLowerCase().split(/\s+/)[0]!)) out.push(`mentions "${fest}" but no such occasion is near ${date}`);
  return out;
}

/** Plain checks over the batch and the recently posted pieces. */
export function ruleFindings(rows: Row[], recent: string[], brandText?: string): RuleFinding[] {
  const out: RuleFinding[] = [];
  rows.forEach((r, index) => {
    const all = `${text(r["title"])} ${text(r["caption"])} ${text(r["video_script"])} ${text(r["body"]).slice(0, 1500)}`;
    const cliches = [...new Set(clichesIn(all))];
    let similarTo = "";
    const mine = fingerprint(r);
    const pool = [...recent, ...rows.slice(0, index).map(fingerprint)];
    for (const other of pool) {
      if (similarity(mine, other) >= SIMILAR_AT) {
        similarTo = other.slice(0, 80);
        break;
      }
    }
    const claims = brandText ? unsupportedClaims(r, brandText) : [];
    if (cliches.length || similarTo || claims.length) out.push({ index, cliches, similarTo, claims });
  });
  return out;
}

interface EditorItem {
  id: number;
  score: number;
  issues: string;
  title: string;
  caption: string;
  script: string;
}

const EDITOR_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer" },
          score: { type: "integer" },
          issues: { type: "string" },
          title: { type: "string" },
          caption: { type: "string" },
          script: { type: "string" },
        },
        required: ["id", "score", "issues", "title", "caption", "script"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

const EDITOR_SYSTEM = `You are a sharp, experienced social media editor for small businesses in India. You edit posts written by an AI so they read like a skilled human wrote them for THIS brand.

Score each piece from 1 to 10 on: sounds like this brand (voice, dos and don'ts, compliance notes), a first line that stops the scroll, specific rather than generic (real products, places, details from the brand info), natural human rhythm (no stiff or salesy phrasing), and fit for the platform. Be strict: 7 means "I would post this as it is".

For every piece scoring below the pass mark, rewrite its title, caption and (video only) script to fix the issues you found. Rules for rewrites:
- Keep the same idea and the same single language as the original. Never add words from another language.
- Use only facts, offers and numbers that appear in the brand information or in the original piece. Never invent statistics, prices, awards, customers or quotes.
- Say nothing about the business itself (what it sells, how it works, what it promises, results, history) unless the brand information says it. General helpful advice is fine; claims about THIS business are not.
- Obey the brand's compliance notes and do's and don'ts exactly.
- Open with a strong, specific first line. No filler openers, no phrases like "in today's fast-paced world", "unlock", "elevate", "game-changer".
- Vary sentence length. Use plain words. At most one emoji per few lines, and only if the brand uses them.
- Keep hashtags out of the caption body. Keep a video script's [HOOK]/[BODY]/[CTA] markers and its length.
- Do not use long dashes (— or –) as punctuation.
For pieces scoring at or above the pass mark, return empty strings for title, caption and script. Pieces you cannot improve: also empty strings.
"issues" is one short sentence naming the main problem, or "ok".`;

/** Mechanical clean-up that never needs the AI: platform length, finished sentences, poster typos. */
export function finalizeRows(rows: Row[], brandText: string): void {
  const known = new Set((brandText.match(/[A-Za-z]{2,}/g) ?? []).map((w) => w.toLowerCase()));
  for (const r of rows) {
    const type = text(r["type"]);
    // X posts are at most 280 characters: cut at the last full sentence or word that fits
    if (type === "twitter_post" && text(r["caption"]).length > 270) {
      const cap = text(r["caption"]).slice(0, 270);
      const sentenceEnd = Math.max(cap.lastIndexOf(". "), cap.lastIndexOf("! "), cap.lastIndexOf("? "));
      r["caption"] = sentenceEnd > 80 ? cap.slice(0, sentenceEnd + 1).trim() : cap.replace(/\s+\S*$/, "").replace(/[,;:\-]$/, "") + ".";
    }
    // a video script must end on a finished sentence
    const script = text(r["video_script"]);
    if (script && !/[.!?।"')\]]\s*$/.test(script.trim())) {
      const cut = Math.max(script.lastIndexOf("."), script.lastIndexOf("!"), script.lastIndexOf("?"), script.lastIndexOf("।"));
      if (cut > script.length * 0.5) r["video_script"] = script.slice(0, cut + 1).trim();
    }
    // a poster headline with a made-up acronym or word (for example "GPS" for "GST") falls back to the title
    if (/post|pinterest/.test(type) && text(r["image_prompt"]).includes("|")) {
      const parts = text(r["image_prompt"]).split(/\|\|?/).map((x) => x.trim());
      const own = new Set(`${text(r["title"])} ${text(r["caption"])}`.toLowerCase().match(/[a-z]{2,}/g) ?? []);
      const unknown = (parts[0] ?? "").match(/\b[A-Z]{2,5}\b/g)?.some((w) => !known.has(w.toLowerCase()) && !own.has(w.toLowerCase()));
      if (unknown && text(r["title"]).trim()) { parts[0] = text(r["title"]).trim(); r["image_prompt"] = parts.join(" || "); }
    }
  }
}

export interface QualityOutcome {
  rows: Row[];
  /** What happened, for the log: how many were scored, rewritten, and the average score. */
  note: string;
}

function minScore(): number {
  const n = Number(process.env["CONTENT_QUALITY_MIN_SCORE"] ?? 7);
  return Number.isFinite(n) ? Math.min(10, Math.max(1, Math.round(n))) : 7;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`quality pass timed out after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/** Recent titles and openings for this brand, newest first. */
async function recentFingerprints(admin: AdminClient, userId: string, brandId: string): Promise<string[]> {
  const { data } = await admin
    .from("content_items")
    .select("title, caption")
    .eq("user_id", userId)
    .eq("brand_id", brandId)
    .neq("status", "draft")
    .neq("status", "failed")
    .order("scheduled_date", { ascending: false })
    .limit(60);
  return ((data ?? []) as Array<{ title: string | null; caption: string | null }>).map(
    (r) => `${r.title ?? ""} ${(r.caption ?? "").slice(0, 160)}`,
  );
}

/**
 * Cleans and edits the batch. `brandText` is the brand's own information and playbook (the same
 * text the writer saw); it is also the only place rewritten numbers may come from.
 */
export async function polishRows(
  admin: AdminClient,
  opts: { userId: string; brandId: string; rows: Row[]; brandText: string },
): Promise<QualityOutcome> {
  const rows = opts.rows.map((r) => ({ ...r }));
  // Plain clean-up that never needs the AI.
  for (const r of rows) {
    for (const k of ["title", "caption", "video_script"] as const) if (typeof r[k] === "string") r[k] = plainDashes(r[k] as string);
  }
  if ((process.env["CONTENT_QUALITY_GATE"] ?? "on").trim().toLowerCase() === "off") {
    finalizeRows(rows, opts.brandText);
    return { rows, note: "editor pass off" };
  }
  try {
    const recent = await recentFingerprints(admin, opts.userId, opts.brandId).catch(() => []);
    const findings = ruleFindings(rows, recent, opts.brandText);
    const found = new Map(findings.map((f) => [f.index, f]));
    const pass = minScore();

    const list = rows
      .map((r, i) => {
        const meta = (r["style_meta"] ?? {}) as { pillar?: string; hook?: string; angle?: string };
        const f = found.get(i);
        const flags = [
          f?.cliches.length ? `uses stock phrases: ${f.cliches.join(", ")}` : "",
          f?.similarTo ? `too close to an earlier post: "${f.similarTo}"` : "",
          f?.claims.length ? `remove these unsupported claims: ${f.claims.join("; ")}` : "",
        ].filter(Boolean);
        return [
          `#${i} ${text(r["type"])} on ${text(r["scheduled_date"])}${meta.pillar ? ` | pillar: ${meta.pillar}` : ""}${meta.hook ? ` | hook: ${meta.hook}` : ""}${meta.angle ? ` | angle: ${meta.angle}` : ""}`,
          `TITLE: ${text(r["title"])}`,
          `CAPTION: ${text(r["caption"]).slice(0, 900)}`,
          text(r["video_script"]) ? `SCRIPT: ${text(r["video_script"]).slice(0, 900)}` : "",
          flags.length ? `FLAGS (fix these): ${flags.join("; ")}` : "",
        ]
          .filter(Boolean)
          .join("\n");
      })
      .join("\n\n");

    const prompt = `BRAND INFORMATION AND PLAYBOOK:\n${opts.brandText.slice(0, 6500)}\n\nPASS MARK: ${pass}\n\nPIECES TO EDIT:\n\n${list}\n\nReturn one item per piece with the same id.`;
    const timeout = Number(process.env["CONTENT_QUALITY_TIMEOUT_MS"] ?? 25000) || 25000;
    const result = await withTimeout(
      chatJSON<{ items?: EditorItem[] }>(EDITOR_SYSTEM, prompt, EDITOR_SCHEMA as never, { reasoningEffort: "low", maxTokens: 4500 }),
      timeout,
    );

    let rewritten = 0;
    let scored = 0;
    let total = 0;
    for (const it of result.items ?? []) {
      const r = rows[it.id];
      if (!r) continue;
      scored += 1;
      total += it.score;
      const original = `${text(r["title"])} ${text(r["caption"])} ${text(r["video_script"])}`;
      const allowed = `${opts.brandText} ${original}`;
      const flagged = found.has(it.id);
      let fixed = false;
      if (it.score < pass || flagged) {
        const next = {
          title: plainDashes(it.title.trim()),
          caption: plainDashes(it.caption.trim()),
          script: plainDashes(it.script.trim()),
        };
        const candidate = `${next.title} ${next.caption} ${next.script}`;
        const claimFlagged = (found.get(it.id)?.claims.length ?? 0) > 0;
        const usable =
          (next.title || next.caption || next.script) &&
          (claimFlagged
            ? unsupportedClaims({ title: next.title || r["title"], caption: next.caption || r["caption"], video_script: next.script || r["video_script"], scheduled_date: r["scheduled_date"] }, opts.brandText).length === 0
            : numbersAllowed(withoutListCounts(candidate), allowed)) &&
          clichesIn(candidate).length === 0 &&
          (!next.caption || next.caption.length >= 20);
        if (usable) {
          if (next.title) r["title"] = next.title;
          if (next.caption) r["caption"] = next.caption;
          if (next.script && text(r["video_script"])) r["video_script"] = next.script;
          fixed = true;
          rewritten += 1;
        }
      }
      const meta = (r["style_meta"] && typeof r["style_meta"] === "object" ? r["style_meta"] : { v: 1, pillar: "", hook: "" }) as Record<string, unknown>;
      r["style_meta"] = { ...meta, q: { score: it.score, fixed, note: it.issues.slice(0, 140) } };
    }
    // Last line of defence: anything still claiming something the brand never said is fixed or cut.
    const fixedClaims = await removeUnsupportedClaims(rows, opts.brandText);
    finalizeRows(rows, opts.brandText);
    const avg = scored ? (total / scored).toFixed(1) : "n/a";
    return { rows, note: `edited ${scored} piece(s), rewrote ${rewritten}, average score ${avg}, flagged by plain checks ${findings.length}, claims removed ${fixedClaims}` };
  } catch (error) {
    finalizeRows(rows, opts.brandText);
    return { rows, note: `editor pass skipped: ${error instanceof Error ? error.message : String(error)}` };
  }
}


const CLAIM_FIX_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "integer" }, title: { type: "string" }, caption: { type: "string" }, script: { type: "string" } },
        required: ["id", "title", "caption", "script"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

const CLAIM_FIX_SYSTEM = `You fix social media posts that claim things the business never said. For each piece, rewrite its title, caption and (video only) script so that EVERY number, statistic, saving, user count, percentage, customer story, testimonial, result and festival mention is either taken from the brand information or removed. Keep the same idea, voice and single language; keep a video script's [HOOK]/[BODY]/[CTA] markers. Never invent anything to replace what you remove: say it in general words instead ("many freelancers" is NOT allowed either if the brand did not say it; say what the product does). Return the fixed title, caption and script for every piece.`;

/** Sentences that contain one of the unsupported numbers or a story, removed as a last resort. */
function stripSentences(value: string, offenders: RegExp): string {
  return value
    .split("\n")
    .map((line) => {
      if (/^\s*\[(HOOK|BODY|CTA)\]\s*$/i.test(line)) return line;
      const marker = /^(\s*\[(?:HOOK|BODY|CTA)\]\s*)/i.exec(line)?.[1] ?? "";
      const rest = line.slice(marker.length);
      const kept = rest.split(/(?<=[.!?])\s+/).filter((sentence) => !offenders.test(sentence));
      return kept.length ? `${marker}${kept.join(" ")}` : marker.trim() ? marker : "";
    })
    .join("\n")
    .trim();
}

async function removeUnsupportedClaims(rows: Row[], brandText: string): Promise<number> {
  const bad = rows
    .map((r, i) => ({ r, i, claims: unsupportedClaims(r, brandText) }))
    .filter((x) => x.claims.length);
  if (!bad.length) return 0;
  let fixed = 0;
  try {
    const list = bad
      .map((x, k) => `#${k} ${text(x.r["type"])} | claims to remove: ${x.claims.join("; ")}\nTITLE: ${text(x.r["title"])}\nCAPTION: ${text(x.r["caption"]).slice(0, 900)}${text(x.r["video_script"]) ? `\nSCRIPT: ${text(x.r["video_script"]).slice(0, 900)}` : ""}`)
      .join("\n\n");
    const res = await withTimeout(
      chatJSON<{ items?: Array<{ id: number; title: string; caption: string; script: string }> }>(
        CLAIM_FIX_SYSTEM,
        `BRAND INFORMATION:\n${brandText.slice(0, 5500)}\n\nPIECES:\n\n${list}\n\nReturn one item per piece with the same id.`,
        CLAIM_FIX_SCHEMA as never,
        { reasoningEffort: "low", maxTokens: 3500 },
      ),
      Number(process.env["CONTENT_QUALITY_TIMEOUT_MS"] ?? 25000) || 25000,
    );
    for (const it of res.items ?? []) {
      const x = bad[it.id];
      if (!x) continue;
      const next = { title: plainDashes((it.title ?? "").trim()), caption: plainDashes((it.caption ?? "").trim()), script: plainDashes((it.script ?? "").trim()) };
      const candidate = { ...x.r, title: next.title || x.r["title"], caption: next.caption || x.r["caption"], video_script: next.script && text(x.r["video_script"]) ? next.script : x.r["video_script"] };
      if (unsupportedClaims(candidate, brandText).length === 0 && clichesIn(`${next.title} ${next.caption} ${next.script}`).length === 0) {
        x.r["title"] = candidate.title;
        x.r["caption"] = candidate.caption;
        x.r["video_script"] = candidate.video_script;
        fixed += 1;
      }
    }
  } catch {
    /* fall through to the plain cut below */
  }
  // Anything still unsupported: cut the sentences that carry the claim (captions and scripts only).
  for (const x of bad) {
    const remaining = unsupportedClaims(x.r, brandText);
    if (!remaining.length) continue;
    const nums = [...remaining.join(" ").matchAll(/\(([^)]*)\)/g)].flatMap((m) => (m[1] ?? "").split(/,\s*/)).filter(Boolean);
    const offenders = new RegExp([...nums.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), STORY.source, FESTIVAL_RE.source, PLACEHOLDER_RE.source].filter(Boolean).join("|"), "i");
    for (const k of ["caption", "video_script"] as const) if (text(x.r[k])) x.r[k] = stripSentences(text(x.r[k]), offenders);
    // a claim in the title: use the first clean sentence of the caption as the title instead
    if (offenders.test(text(x.r["title"]))) {
      const clean = text(x.r["caption"]).split(/(?<=[.!?])\s+/).map((s) => s.replace(/[#@]\S+/g, "").trim()).find((s) => s.length >= 12 && s.length <= 80 && !offenders.test(s));
      if (clean) x.r["title"] = clean.replace(/[.!?]+$/, "");
    }
    const meta = (x.r["style_meta"] && typeof x.r["style_meta"] === "object" ? x.r["style_meta"] : {}) as Record<string, unknown>;
    const left = unsupportedClaims(x.r, brandText);
    x.r["style_meta"] = { ...meta, claims_left: left.length ? left.join("; ").slice(0, 200) : null };
    if (!left.length) fixed += 1;
  }
  return fixed;
}
