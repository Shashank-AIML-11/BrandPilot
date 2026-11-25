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
  wildcard?: boolean;
}

export const HOOK_STYLES: Array<{ id: string; how: string }> = [
  { id: "question", how: "open with a direct question the audience is already asking" },
  { id: "stat", how: "open with a specific number or fact from the brand's own context" },
  { id: "bold_claim", how: "open with a confident, slightly provocative claim, then back it up" },
  { id: "story", how: "open with a short real-feeling moment or scene, then the lesson" },
  { id: "how_to", how: "promise a clear how-to and deliver concrete steps" },
  { id: "myth_bust", how: "name a common myth, then correct it" },
  { id: "list", how: "numbered list of quick, useful points" },
  { id: "contrarian", how: "challenge a habit or belief in the industry, then give the better way" },
  { id: "before_after", how: "contrast the problem state with the improved state" },
  { id: "behind_scenes", how: "show how the work actually gets done, in a human voice" },
  { id: "customer_voice", how: "speak in the audience's own words about their problem (no invented quotes or names)" },
  { id: "offer", how: "lead with the offer or next step and why now" },
];

/** Block this many most recent uses before an option may repeat. */
const BLOCK_PILLAR = 3;
const BLOCK_HOOK = 5;
const BLOCK_TEMPLATE = 6;
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
    pillarsByType: byType((m) => m.pillar),
    hooksByType: byType((m) => m.hook),
  };
}

/**
 * Chooses a style for every slot. Returns null when there is no playbook, so the caller
 * simply generates as before.
 */
export async function planVariety(
  admin: AdminClient,
  opts: { userId: string; brandId: string; slots: Slot[]; playbook: Playbook | null },
): Promise<Map<string, StyleMeta> | null> {
  const { playbook } = opts;
  if (!playbook || !playbook.pillars.length || !opts.slots.length) return null;
  try {
    const hist = await recentHistory(admin, opts.userId, opts.brandId);
    const pillars = playbook.pillars.map((p) => p.name);
    const hooks = HOOK_STYLES.map((h) => h.id);
    const preferred = playbook.preferred_templates.length >= 5 ? playbook.preferred_templates : POSTER_TEMPLATE_IDS;

    // history lists are newest first; picks made now go to the front so the next slot sees them
    const usedPillars = [...hist.pillars];
    const usedHooks = [...hist.hooks];
    const usedTemplates = [...hist.templates];
    const pillarsByType: Record<string, string[]> = Object.fromEntries(Object.entries(hist.pillarsByType).map(([k, v]) => [k, [...v]]));
    const hooksByType: Record<string, string[]> = Object.fromEntries(Object.entries(hist.hooksByType).map(([k, v]) => [k, [...v]]));
    const groupTemplate = new Map<string, string>(); // one template per date for the shared image
    const out = new Map<string, StyleMeta>();
    let n = 0;

    for (const slot of opts.slots) {
      n += 1;
      const seed = `${opts.brandId}|${slot.date}|${slot.type}|${slot.index}`;
      const wildcard = n % 5 === 0;
      const pillar = pickLeastRecent(pillars, usedPillars, BLOCK_PILLAR, `${seed}p`, pillarsByType[slot.type] ?? []);
      const hook = pickLeastRecent(hooks, usedHooks, BLOCK_HOOK, `${seed}h`, hooksByType[slot.type] ?? []);
      usedPillars.unshift(pillar);
      usedHooks.unshift(hook);
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

      out.set(slotKey(slot.date, slot.type, slot.index), {
        v: 1,
        pillar,
        hook,
        ...(template ? { template } : {}),
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
      return `- ${s.date} ${s.type} #${s.index + 1}: pillar "${m.pillar}" (${pillarAngle.get(m.pillar) ?? ""}); hook style "${m.hook}" (${hookHow.get(m.hook) ?? ""})${
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
Each piece below has its own content pillar, hook style and, for image posts, its own poster template. Write that piece on that pillar, in that hook style. Do NOT reuse the same opening, structure or angle across pieces.
${lines.join("\n")}${occasions}${photos}
=== END CONTENT PLAN ===`;
}

export { POSTER_TEMPLATES };
