/**
 * Brand Brain playbook. Server-only.
 *
 * When a Brand Profile is saved, the AI reads it once and writes a compact "playbook" for
 * that brand: voice, content pillars, audience pains, visual direction, preferred poster
 * templates and the occasions worth posting about. Every generation then starts from it,
 * so the brand never has to say again what to create. It is rebuilt automatically whenever
 * the profile changes (the stored copy remembers which profile version it was built from).
 *
 * Everything here fails soft: if the table is missing or the AI call fails, generation
 * continues exactly as before without a playbook.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { chatJSON, strategyChatOptions } from "@/lib/ai.server";
import { brandContext, SAFETY_RULES } from "@/lib/content.server";
import { POSTER_TEMPLATE_IDS } from "@/lib/poster-templates";

type AdminClient = SupabaseClient<Database>;

export interface Playbook {
  voice_summary: string;
  voice_do: string[];
  voice_dont: string[];
  pillars: Array<{ name: string; angle: string }>;
  audience_pains: string[];
  visual_mood: string;
  photo_subjects: string[];
  visual_avoid: string[];
  preferred_templates: string[];
  occasions: Array<{ name: string; when: string; idea: string }>;
  cta_style: string;
}

const PLAYBOOK_SCHEMA = {
  type: "object",
  properties: {
    voice_summary: { type: "string" },
    voice_do: { type: "array", items: { type: "string" } },
    voice_dont: { type: "array", items: { type: "string" } },
    pillars: {
      type: "array",
      items: {
        type: "object",
        properties: { name: { type: "string" }, angle: { type: "string" } },
        required: ["name", "angle"],
        additionalProperties: false,
      },
    },
    audience_pains: { type: "array", items: { type: "string" } },
    visual_mood: { type: "string" },
    photo_subjects: { type: "array", items: { type: "string" } },
    visual_avoid: { type: "array", items: { type: "string" } },
    preferred_templates: { type: "array", items: { type: "string", enum: POSTER_TEMPLATE_IDS } },
    occasions: {
      type: "array",
      items: {
        type: "object",
        properties: { name: { type: "string" }, when: { type: "string" }, idea: { type: "string" } },
        required: ["name", "when", "idea"],
        additionalProperties: false,
      },
    },
    cta_style: { type: "string" },
  },
  required: [
    "voice_summary", "voice_do", "voice_dont", "pillars", "audience_pains", "visual_mood",
    "photo_subjects", "visual_avoid", "preferred_templates", "occasions", "cta_style",
  ],
  additionalProperties: false,
} as const;

const PLAYBOOK_SYSTEM = `You are a senior brand strategist building the standing content playbook for ONE brand.
Use only what the brand profile says; never invent products, prices, awards, customers or statistics.
Write everything in clear English. Be specific to this brand and its audience, never generic.
${SAFETY_RULES}`;

function templateMenu(): string {
  return POSTER_TEMPLATE_IDS.join(", ");
}

function playbookPrompt(brand: Record<string, unknown>): string {
  return `${brandContext(brand as never)}

Build this brand's playbook as JSON:
- voice_summary: 1-2 sentences describing how this brand sounds.
- voice_do: 4-6 short rules for writing in this voice. voice_dont: 4-6 things to avoid.
- pillars: 5 or 6 content pillars (name + a one-sentence angle) that together cover education, proof, product/service, audience pain points, behind-the-scenes or culture, and offers. Each must be specific to this brand.
- audience_pains: 5 concrete problems or desires of the ideal customer, in their own words.
- visual_mood: one sentence of photo and colour direction that fits the brand.
- photo_subjects: 6-8 concrete, filmable photo subjects that suit this brand (people, places, objects, situations).
- visual_avoid: 3-5 visual things that would look wrong for this brand.
- preferred_templates: 8-12 poster template ids that suit this brand, chosen ONLY from: ${templateMenu()}. Include a healthy mix of photo and type-only templates.
- occasions: 6-8 dated or seasonal moments (festivals, industry days, seasons) relevant to this brand and its market, each with a one-line post idea. "when" is a month name or a month and day.
- cta_style: one sentence on how this brand should ask for action (soft, direct, consultative...).`;
}

function clampList(v: unknown, max: number): string[] {
  return (Array.isArray(v) ? v : []).map((x) => String(x ?? "").trim()).filter(Boolean).slice(0, max);
}

function normalise(raw: Partial<Playbook>): Playbook {
  const known = new Set(POSTER_TEMPLATE_IDS);
  const templates = clampList(raw.preferred_templates, 14).filter((t) => known.has(t));
  return {
    voice_summary: String(raw.voice_summary ?? "").trim().slice(0, 400),
    voice_do: clampList(raw.voice_do, 6),
    voice_dont: clampList(raw.voice_dont, 6),
    pillars: (Array.isArray(raw.pillars) ? raw.pillars : [])
      .map((p) => ({ name: String(p?.name ?? "").trim().slice(0, 60), angle: String(p?.angle ?? "").trim().slice(0, 240) }))
      .filter((p) => p.name)
      .slice(0, 6),
    audience_pains: clampList(raw.audience_pains, 6),
    visual_mood: String(raw.visual_mood ?? "").trim().slice(0, 300),
    photo_subjects: clampList(raw.photo_subjects, 8),
    visual_avoid: clampList(raw.visual_avoid, 5),
    preferred_templates: templates,
    occasions: (Array.isArray(raw.occasions) ? raw.occasions : [])
      .map((o) => ({
        name: String(o?.name ?? "").trim().slice(0, 80),
        when: String(o?.when ?? "").trim().slice(0, 40),
        idea: String(o?.idea ?? "").trim().slice(0, 200),
      }))
      .filter((o) => o.name)
      .slice(0, 8),
    cta_style: String(raw.cta_style ?? "").trim().slice(0, 240),
  };
}

type BrandWithStamp = { id: string; user_id: string; business_name?: string | null; updated_at?: string | null };

/**
 * Returns the brand's playbook, building (or rebuilding) it when it is missing or the
 * profile changed since. Returns null if the brand has no profile content yet or anything
 * fails, so callers can simply carry on without one.
 */
export async function ensurePlaybook(
  admin: AdminClient,
  brand: BrandWithStamp,
  opts: { force?: boolean } = {},
): Promise<Playbook | null> {
  try {
    if (!brand?.id || !brand.business_name) return null;
    const { data: stored, error } = await admin
      .from("brand_playbooks" as never)
      .select("playbook, source_updated_at")
      .eq("brand_id", brand.id)
      .maybeSingle();
    if (error) throw new Error((error as { message: string }).message);

    const row = stored as { playbook?: Partial<Playbook>; source_updated_at?: string | null } | null;
    const stamp = brand.updated_at ?? null;
    const fresh =
      row?.playbook &&
      Array.isArray(row.playbook.pillars) &&
      row.playbook.pillars.length > 0 &&
      (!stamp || (row.source_updated_at && new Date(row.source_updated_at).getTime() >= new Date(stamp).getTime()));
    if (fresh && !opts.force) return normalise(row!.playbook!);

    const raw = await chatJSON<Partial<Playbook>>(
      PLAYBOOK_SYSTEM,
      playbookPrompt(brand as never),
      PLAYBOOK_SCHEMA as never,
      strategyChatOptions(),
    );
    const playbook = normalise(raw);
    if (!playbook.pillars.length) throw new Error("the playbook came back without content pillars");

    const { error: saveError } = await admin.from("brand_playbooks" as never).upsert(
      {
        brand_id: brand.id,
        user_id: brand.user_id,
        playbook,
        source_updated_at: stamp ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "brand_id" },
    );
    if (saveError) console.error("[brain] could not save the playbook", (saveError as { message: string }).message);
    return playbook;
  } catch (error) {
    console.error("[brain] playbook unavailable, continuing without it", error instanceof Error ? error.message : error);
    return null;
  }
}

/** The playbook as prompt text for the content writer. */
export function playbookContext(pb: Playbook | null): string {
  if (!pb) return "";
  const list = (items: string[]) => items.map((x) => `  - ${x}`).join("\n");
  return `

=== BRAND PLAYBOOK (this brand's standing strategy; follow it) ===
Voice: ${pb.voice_summary}
Always: ${pb.voice_do.join("; ")}
Never: ${pb.voice_dont.join("; ")}
Audience problems to speak to:
${list(pb.audience_pains)}
Visual direction: ${pb.visual_mood}
How this brand asks for action: ${pb.cta_style}
=== END PLAYBOOK ===`;
}
