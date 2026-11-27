/**
 * Variety planner. Server-only.
 *
 * For every piece about to be written it picks a content pillar, a hook style and (for image
 * posts) a poster template, always preferring the ones this brand used least recently and
 * blocking the most recent ones, so a brand's feed does not look the same week after week.
 * About one pick in five is a "wildcard" outside the brand's usual shortlist.
 *
 * The choice is stored on each content item (style_meta) which is also what the next run
 * reads to know what was used lately. Fails soft: with no playbook it returns no plan.
 */
import { SEED_PATTERNS, anglesFor, craftRules, hooksOf, industryGroupOf, type PatternRow } from "@/lib/pattern-library";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { Playbook } from "@/lib/playbook.server";
import { CONTENT_TYPES, SHARED_IMAGE_TYPES, IMAGE_TYPES, VIDEO_TYPES, type ContentType, type DailyContentQuota } from "@/lib/content.server";
import { POSTER_TEMPLATES, POSTER_TEMPLATE_IDS, posterTemplate } from "@/lib/poster-templates";

type AdminClient = SupabaseClient<Database>;

export interface StyleMeta {
  v: 1;
  pillar: string;
  hook: string;
  template?: string;
  /** The specific angle chosen from ANGLE_BANK, so two pieces never tell the same story. */
  angle?: string;
  /** Reel recipe id (video types only): the shape of the scene sequence. */
  recipe?: string;
  wildcard?: boolean;
}

/**
 * Reel recipes: the order of scene layouts a video should follow. They are a guide for the
 * scene writer (it still checks each layout has what it needs), so reels do not all share the
 * same hook, list, phone, call-to-action shape.
 */
export const REEL_RECIPES: Array<{ id: string; order: string; note: string }> = [
  { id: "problem_fix", order: "hook > problem_solution > feature_cards > broll > cta_end", note: "name a pain, show the fix, prove it with real life footage" },
  { id: "numbers_story", order: "hook > stat_hero > steps > broll > cta_end", note: "lead with one strong number from the brand info, then explain how it works" },
  { id: "tips_list", order: "question > checklist > statement > phone_post > cta_end", note: "quick useful tips in a list" },
  { id: "compare_choose", order: "hook > compare > feature_cards > offer_card > cta_end", note: "before vs after or us vs the usual way, then the offer" },
  { id: "journey", order: "hook > timeline > broll > statement > cta_end", note: "a short journey from problem to result" },
  { id: "phone_demo", order: "hook > phone_chat > phone_notify > statement > cta_end", note: "show it working on a phone, human and simple" },
  { id: "myth_truth", order: "question > statement > problem_solution > checklist > cta_end", note: "a common belief, then the truth" },
  { id: "offer_push", order: "hook > feature_cards > tags > offer_card > cta_end", note: "what is included, who it is for, the offer" },
  { id: "settings_walkthrough", order: "hook > statement > steps > phone_post > checklist > cta_end", note: "one thing most people get wrong, the exact steps to fix it, what changes after; short punchy lines, one highlighted word per scene" },
  { id: "ranked_picks", order: "hook > stat_grid > feature_cards > tags > statement > cta_end", note: "a numbered set of picks (top 5 or 9), each with a one-line reason; say how many in the first scene" },
  { id: "doodle_story", order: "question > timeline > stat_hero > problem_solution > statement > cta_end", note: "tell one real moment as a story with a single number at the turning point; plain light scenes, no stock footage" },
  { id: "myth_vs_fact_card", order: "hook > problem_solution > compare > checklist > statement > cta_end", note: "stamp the myth as wrong, then show the right way side by side and what to do now" },
];

export const HOOK_STYLES: Array<{ id: string; how: string }> = hooksOf(SEED_PATTERNS);

/**
 * Angles: the specific story a piece tells. A pillar says WHAT it is about; the angle says HOW.
 * One angle is assigned per piece, and none repeats within a day or among the last few used.
 */
export const ANGLE_BANK: string[] = anglesFor(SEED_PATTERNS, null);

/** Block this many most recent uses before an option may repeat. */
const BLOCK_PILLAR = 3;
const BLOCK_HOOK = 5;
const BLOCK_TEMPLATE = 6;
const BLOCK_ANGLE = 10;
const HISTORY_LIMIT = 80;

const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

/** Picks the option used longest ago (never-used first), skipping the `block` most recent. */
function pickLeastRecent(
  options: string[],
  recent: string[],
  block: number,
  seed: string,
  /** Uses by this same content type, newest first: breaks ties so each type cycles through every option. */
  recentForType: string[] = [],
): string {
  if (!options.length) return "";
  const blocked = new Set(recent.slice(0, block));
  const pool = options.filter((o) => !blocked.has(o));
  const use = pool.length ? pool : options;
  const age = (list: string[]) => (o: string) => {
    const i = list.indexOf(o);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  const typeAge = age(recentForType);
  const bestType = Math.max(...use.map(typeAge));
  const byType = use.filter((o) => typeAge(o) === bestType);
  const globalAge = age(recent);
  const bestGlobal = Math.max(...byType.map(globalAge));
  const top = byType.filter((o) => globalAge(o) === bestGlobal);
  return top[hash(seed) % top.length]!;
}

export type Slot = { date: string; type: ContentType; index: number };
export const slotKey = (date: string, type: string, index: number) => `${date}|${type}|${index}`;

/** Every (date, type, n) the model is about to write, in date order. */
export function slotsFromQuotas(
  dates: string[],
  quotas: Record<string, DailyContentQuota> | undefined,
  types: readonly ContentType[] = CONTENT_TYPES,
): Slot[] {
  const out: Slot[] = [];
  for (const date of [...dates].sort()) {
    for (const type of CONTENT_TYPES) {
      if (!types.includes(type)) continue;
      const want = quotas?.[date]?.[type] ?? 0;
      for (let i = 0; i < want; i += 1) out.push({ date, type, index: i });
    }
  }
  return out;
}

async function recentHistory(admin: AdminClient, userId: string, brandId: string) {
  const { data, error } = await admin
    .from("content_items")
    .select("style_meta, scheduled_date, type")
    .eq("user_id", userId)
    .eq("brand_id", brandId)
    .not("style_meta", "is", null)
    .order("scheduled_date", { ascending: false })
    .limit(HISTORY_LIMIT);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as Array<{ style_meta: StyleMeta | null; scheduled_date: string; type: string }>;
  const styled = rows.filter((r) => r.style_meta && typeof r.style_meta === "object");
  const metas = styled.map((r) => r.style_meta as StyleMeta);
  const byType = (pick: (m: StyleMeta) => string | undefined) => {
    const out: Record<string, string[]> = {};
    for (const r of styled) {
      const v = pick(r.style_meta as StyleMeta);
      if (v) (out[r.type] ??= []).push(v);
    }
    return out;
  };
  return {
    pillars: metas.map((m) => m.pillar).filter(Boolean),
    hooks: metas.map((m) => m.hook).filter(Boolean),
    templates: metas.map((m) => m.template).filter((t): t is string => !!t),
    recipes: metas.map((m) => m.recipe).filter((t): t is string => !!t),
    angles: metas.map((m) => m.angle).filter((t): t is string => !!t),
    pillarsByType: byType((m) => m.pillar),
    hooksByType: byType((m) => m.hook),
  };
}

/**
 * Chooses a style for every slot. Returns null when there is no playbook, so the caller
 * simply generates as before.
 */
/** The live library from the database, or the built-in seed when the table is missing or empty. Never throws. */
export async function loadLibrary(admin: AdminClient): Promise<PatternRow[]> {
  try {
    const { data, error } = await admin
      .from("pattern_library" as never)
      .select("dimension,key,label,template,why,industries,source,weight,active" as never)
      .eq("active" as never, true as never);
    if (error || !Array.isArray(data) || data.length < 20) return SEED_PATTERNS;
    return (data as unknown as PatternRow[]).map((r) => ({ ...r, industries: r.industries ?? [] }));
  } catch {
    return SEED_PATTERNS;
  }
}

export async function planVariety(
  admin: AdminClient,
  opts: { userId: string; brandId: string; slots: Slot[]; playbook: Playbook | null },
): Promise<Map<string, StyleMeta> | null> {
  const { playbook } = opts;
  if (!playbook || !playbook.pillars.length || !opts.slots.length) return null;
  try {
    const hist = await recentHistory(admin, opts.userId, opts.brandId);
    const pillars = playbook.pillars.map((p) => p.name);
    const library = await loadLibrary(admin);
    let group: ReturnType<typeof industryGroupOf> = null;
    try {
      const { data: prof } = await admin.from("brand_profiles").select("industry").eq("id", opts.brandId).maybeSingle();
      group = industryGroupOf((prof as { industry?: string } | null)?.industry);
    } catch {
      group = null;
    }
    const hooks = hooksOf(library).map((h) => h.id);
    const angleBank = anglesFor(library, group);
    const preferred = playbook.preferred_templates.length >= 5 ? playbook.preferred_templates : POSTER_TEMPLATE_IDS;

    // history lists are newest first; picks made now go to the front so the next slot sees them
    const usedPillars = [...hist.pillars];
    const usedHooks = [...hist.hooks];
    const usedTemplates = [...hist.templates];
    const pillarsByType: Record<string, string[]> = Object.fromEntries(Object.entries(hist.pillarsByType).map(([k, v]) => [k, [...v]]));
    const hooksByType: Record<string, string[]> = Object.fromEntries(Object.entries(hist.hooksByType).map(([k, v]) => [k, [...v]]));
    const usedRecipes = [...hist.recipes];
    const usedAngles = [...hist.angles];
    const dayUsed = new Map<string, { angles: Set<string>; hooks: Set<string>; pillars: Set<string> }>();
    const groupRecipe = new Map<string, string>(); // all video types of one day share one render
    const groupTemplate = new Map<string, string>(); // one template per date for the shared image
    const out = new Map<string, StyleMeta>();
    let n = 0;

    for (const slot of opts.slots) {
      n += 1;
      const seed = `${opts.brandId}|${slot.date}|${slot.type}|${slot.index}`;
      const wildcard = n % 5 === 0;
      // Within one day nothing repeats while there are fresh options left.
      const day = dayUsed.get(slot.date) ?? { angles: new Set<string>(), hooks: new Set<string>(), pillars: new Set<string>() };
      dayUsed.set(slot.date, day);
      const fresh = (all: string[], used: Set<string>) => {
        const left = all.filter((o) => !used.has(o));
        return left.length ? left : all;
      };
      const pillar = pickLeastRecent(fresh(pillars, day.pillars), usedPillars, BLOCK_PILLAR, `${seed}p`, pillarsByType[slot.type] ?? []);
      const hook = pickLeastRecent(fresh(hooks, day.hooks), usedHooks, BLOCK_HOOK, `${seed}h`, hooksByType[slot.type] ?? []);
      const angle = pickLeastRecent(fresh(angleBank, day.angles), usedAngles, BLOCK_ANGLE, `${seed}a`);
      day.pillars.add(pillar);
      day.hooks.add(hook);
      day.angles.add(angle);
      usedPillars.unshift(pillar);
      usedHooks.unshift(hook);
      usedAngles.unshift(angle);
      (pillarsByType[slot.type] ??= []).unshift(pillar);
      (hooksByType[slot.type] ??= []).unshift(hook);

      let template: string | undefined;
      const isImage = (IMAGE_TYPES as string[]).includes(slot.type);
      if (isImage) {
        const shared = (SHARED_IMAGE_TYPES as string[]).includes(slot.type);
        const groupKey = `${slot.date}|shared`;
        if (shared && groupTemplate.has(groupKey)) {
          template = groupTemplate.get(groupKey);
        } else {
          const pool = wildcard ? POSTER_TEMPLATE_IDS : preferred;
          template = pickLeastRecent(pool, usedTemplates, BLOCK_TEMPLATE, `${seed}t`);
          usedTemplates.unshift(template);
          if (shared) groupTemplate.set(groupKey, template);
        }
      } else if (!(VIDEO_TYPES as string[]).includes(slot.type)) {
        template = undefined; // blog and carousel carry no poster template
      }

      let recipe: string | undefined;
      if ((VIDEO_TYPES as string[]).includes(slot.type)) {
        const key = `${slot.date}|video`;
        recipe = groupRecipe.get(key);
        if (!recipe) {
          recipe = pickLeastRecent(REEL_RECIPES.map((r) => r.id), usedRecipes, 3, `${seed}r`);
          usedRecipes.unshift(recipe);
          groupRecipe.set(key, recipe);
        }
      }

      out.set(slotKey(slot.date, slot.type, slot.index), {
        v: 1,
        pillar,
        hook,
        angle,
        ...(template ? { template } : {}),
        ...(recipe ? { recipe } : {}),
        ...(wildcard ? { wildcard: true } : {}),
      });
    }
    return out;
  } catch (error) {
    console.error("[brain] variety plan unavailable, continuing without it", error instanceof Error ? error.message : error);
    return null;
  }
}

/** The plan as prompt text: one line per piece, telling the writer exactly which style to use. */
export function varietyContext(
  playbook: Playbook | null,
  plan: Map<string, StyleMeta> | null,
  slots: Slot[],
): string {
  if (!playbook || !plan || !plan.size) return "";
  const pillarAngle = new Map(playbook.pillars.map((p) => [p.name, p.angle]));
  const hookHow = new Map(HOOK_STYLES.map((h) => [h.id, h.how]));
  const lines = slots
    .map((s) => {
      const m = plan.get(slotKey(s.date, s.type, s.index));
      if (!m) return "";
      const tpl = m.template ? posterTemplate(m.template) : null;
      return `- ${s.date} ${s.type} #${s.index + 1}: pillar "${m.pillar}" (${pillarAngle.get(m.pillar) ?? ""}); hook style "${m.hook}" (${hookHow.get(m.hook) ?? ""})${m.angle ? `; angle: ${m.angle}` : ""}${
        tpl ? `; poster template "${tpl.label}": write image_prompt as HEADLINE || POINT 1 || POINT 2 || POINT 3 || CTA with ${tpl.copyHint}` : ""
      }`;
    })
    .filter(Boolean);
  const occasions = playbook.occasions.length
    ? `\nOccasions this brand can use when a date is close (use only if it genuinely fits the date): ${playbook.occasions
        .map((o) => `${o.name} (${o.when}): ${o.idea}`)
        .join(" | ")}`
    : "";
  const photos = playbook.photo_subjects.length
    ? `\nPhoto subjects that suit this brand (for image/thumbnail ideas): ${playbook.photo_subjects.join("; ")}. Avoid: ${playbook.visual_avoid.join("; ")}.`
    : "";
  return `

=== CONTENT PLAN (assigned by the brand brain; follow it exactly) ===
Each piece below has its own content pillar, hook style and, for image posts, its own poster template. Write that piece on that pillar, in that hook style, telling that angle. Do NOT reuse the same opening, structure or angle across pieces. Write like a person who knows this business: concrete details, plain words, no stock phrases such as "unlock", "elevate", "game-changer" or "in today's fast-paced world".
${lines.join("\n")}${occasions}${photos}

Craft rules for video scripts and captions (from the pattern library):
${craftRules(SEED_PATTERNS, { india: true })}
=== END CONTENT PLAN ===`;
}

export { POSTER_TEMPLATES };
