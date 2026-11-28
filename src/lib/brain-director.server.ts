/**
 * Brain director: chooses each piece's pillar, hook, angle and reel recipe by reading the brand,
 * not by rotating through a list. One small AI call per batch sees the brand's playbook (voice,
 * pillars, audience pains, priorities, proof, what worked, what to avoid, occasions), today's dates
 * and the content types, and picks from candidates that are still fresh. Every pick is validated;
 * anything invalid or missing falls back to the rotation plan, so this can only improve the plan.
 */
import { chatJSON } from "@/lib/ai.server";
import type { Playbook } from "@/lib/playbook.server";

export interface DirectSlot {
  date: string;
  type: string;
  index: number;
  /** Occasions genuinely close to this piece's date (from the occasion calendar). */
  occasions?: string;
}

export interface DirectPick {
  pillar?: string;
  hook?: string;
  angle?: string;
  recipe?: string;
  why?: string;
}

interface Input {
  industry: string;
  playbook: Playbook;
  slots: DirectSlot[];
  hooks: Array<{ id: string; how: string }>;
  angles: string[];
  recipes: Array<{ id: string; note: string }>;
  isVideo: (type: string) => boolean;
  /** What each slot would get from the rotation plan; used to avoid breaking day-level variety. */
  fallback: Map<string, { pillar: string; hook: string; angle?: string | undefined; recipe?: string | undefined }>;
  keyOf: (s: DirectSlot) => string;
}

const SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          i: { type: "integer" },
          pillar: { type: "string" },
          hook: { type: "string" },
          angle: { type: "integer" },
          recipe: { type: "string" },
          why: { type: "string" },
        },
        required: ["i", "pillar", "hook", "angle", "recipe", "why"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

const SYSTEM = `You are the strategist inside a brand's content brain. For each planned piece you choose what it should be about and how it should open, so the week as a whole serves the business and never feels random.

Choose using the brand's own context: its audience and their real worries, current priorities and offers, proof it can use, what worked before and what to avoid, the occasions listed for each piece, and the platform behaviour of each content type. Reason like a good marketer: put the educational piece where trust is needed, an offer piece near an occasion or priority, a story where proof exists, a quick tip on busy weekdays, and keep the sequence balanced across the days. Never pick an option the brand's "avoid" list rules out.

Rules:
- pillar must be one of the listed pillars, copied exactly.
- hook must be one of the listed hook ids, copied exactly.
- angle is the NUMBER of one listed angle.
- recipe: for video pieces, one listed recipe id that suits the message; for all other pieces an empty string.
- Within one day, no two pieces share a hook or an angle, and across the batch use no hook or angle more than twice.
- why: at most 14 words, naming the business reason for the choice (for example "gifting push before Christmas; audience asked about price").
- Each piece lists the occasions genuinely close to its date. Use an occasion ONLY if it is listed for that piece; if none is listed, choose an evergreen angle and never assume a festival or season. Festivals that are not listed have passed or are far away.
Return JSON only.`;

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`director timed out after ${ms}ms`)), ms);
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

const weekday = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" });

export async function directPicks(input: Input): Promise<Map<string, DirectPick>> {
  const out = new Map<string, DirectPick>();
  const { playbook: pb } = input;
  if (!input.slots.length || !pb.pillars.length) return out;

  const lines = (label: string, list: string[] | undefined) => (list && list.length ? `${label}: ${list.slice(0, 8).join(" | ")}` : "");
  const brand = [
    `Industry: ${input.industry || "not stated"}`,
    `Voice: ${pb.voice_summary}`,
    lines("Audience worries", pb.audience_pains),
    lines("Current priorities", pb.priorities),
    lines("Proof the content may use", pb.proof_points),
    lines("What worked for this brand", pb.what_works),
    lines("What to avoid", pb.what_to_avoid),
    pb.competitive_angle ? `Positioning: ${pb.competitive_angle}` : "",
    pb.cta_style ? `Usual call to action: ${pb.cta_style}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const pillars = pb.pillars.map((p) => `- ${p.name}: ${p.angle}`).join("\n");
  const hooks = input.hooks.map((h) => `- ${h.id}: ${h.how.slice(0, 90)}`).join("\n");
  const angles = input.angles.map((a, n) => `${n}: ${a}`).join("\n");
  const recipes = input.recipes.map((r) => `- ${r.id}: ${r.note.slice(0, 80)}`).join("\n");
  const slots = input.slots.map((s, n) => `${n}: ${s.date} (${weekday(s.date)}) ${s.type}${s.occasions ? ` [occasions near this date: ${s.occasions}]` : ""}`).join("\n");

  const prompt = `BRAND\n${brand}\n\nPILLARS\n${pillars}\n\nHOOKS\n${hooks}\n\nANGLES\n${angles}\n\nREEL RECIPES\n${recipes}\n\nPIECES TO PLAN\n${slots}`;
  const timeout = Number(process.env["BRAIN_DIRECTOR_TIMEOUT_MS"] ?? 20000) || 20000;
  const res = await withTimeout(
    chatJSON<{ items?: Array<{ i: number; pillar: string; hook: string; angle: number; recipe: string; why: string }> }>(
      SYSTEM,
      prompt,
      SCHEMA as never,
      { reasoningEffort: "low", maxTokens: 3500 },
    ),
    timeout,
  );

  const pillarSet = new Set(pb.pillars.map((p) => p.name));
  const hookSet = new Set(input.hooks.map((h) => h.id));
  const recipeSet = new Set(input.recipes.map((r) => r.id));
  const day = new Map<string, { hooks: Set<string>; angles: Set<number> }>();
  const hookUse = new Map<string, number>();
  const angleUse = new Map<number, number>();
  const dayRecipe = new Map<string, string>();

  for (const it of [...(res.items ?? [])].sort((a, b) => a.i - b.i)) {
    const slot = input.slots[it.i];
    if (!slot) continue;
    const d = day.get(slot.date) ?? { hooks: new Set<string>(), angles: new Set<number>() };
    day.set(slot.date, d);
    const pick: DirectPick = {};
    if (pillarSet.has(it.pillar)) pick.pillar = it.pillar;
    if (hookSet.has(it.hook) && !d.hooks.has(it.hook) && (hookUse.get(it.hook) ?? 0) < 2) {
      pick.hook = it.hook;
      d.hooks.add(it.hook);
      hookUse.set(it.hook, (hookUse.get(it.hook) ?? 0) + 1);
    }
    const angle = input.angles[it.angle];
    if (angle && !d.angles.has(it.angle) && (angleUse.get(it.angle) ?? 0) < 2) {
      pick.angle = angle;
      d.angles.add(it.angle);
      angleUse.set(it.angle, (angleUse.get(it.angle) ?? 0) + 1);
    }
    if (input.isVideo(slot.type) && recipeSet.has(it.recipe)) {
      // all video types of one day share one render, so the first choice for the day wins
      const first = dayRecipe.get(slot.date);
      pick.recipe = first ?? it.recipe;
      if (!first) dayRecipe.set(slot.date, it.recipe);
    }
    const why = String(it.why ?? "").replace(/\s+/g, " ").trim().slice(0, 140);
    if (why) pick.why = why;
    out.set(input.keyOf(slot), pick);
  }
  return out;
}
