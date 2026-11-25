/**
 * The catalogue of app-built poster templates. Shared by the poster composer (which draws
 * them) and the variety planner (which chooses between them), so it holds no server code.
 *
 * Every template reads the same on-image copy:  HEADLINE || POINT 1 || POINT 2 || POINT 3 || CTA
 * `copyHint` tells the writer how to use those slots for that template.
 */
export interface PosterTemplateInfo {
  id: string;
  label: string;
  /** Needs a photo to look right (otherwise it is drawn type-only). */
  photo: "yes" | "no" | "optional";
  /** How the writer should fill image_prompt for this template. */
  copyHint: string;
}

export const POSTER_TEMPLATES: PosterTemplateInfo[] = [
  { id: "hero_gradient", label: "Full photo with gradient", photo: "yes", copyHint: "a short punchy HEADLINE (max 8 words), 3 short feature points, and a CTA of 2-4 words" },
  { id: "color_block", label: "Brand-colour block with photo card", photo: "yes", copyHint: "a clear HEADLINE (max 8 words), 3 short benefits, and a CTA" },
  { id: "circle_ring", label: "Light agency ad with ringed photo", photo: "yes", copyHint: "a benefit-led HEADLINE (max 8 words), 3 short points, and a CTA" },
  { id: "quote_card", label: "Quote card", photo: "optional", copyHint: "HEADLINE = one memorable statement or insight of 8-14 words (no quotation marks); the 3 points = three short supporting phrases (max 5 words each); CTA 2-4 words" },
  { id: "tips_list", label: "Numbered tips list", photo: "no", copyHint: "HEADLINE = a promise like '3 ways to ...' (max 8 words); the 3 points = three concrete, short tips (max 6 words each); CTA 2-4 words" },
  { id: "stat_hero", label: "Big stat", photo: "optional", copyHint: "HEADLINE = ONE striking number or short stat such as '3x' or '45 minutes' or '₹0'; the 3 points = what it means for the customer (max 6 words each); CTA 2-4 words" },
  { id: "myth_fact", label: "Myth vs fact", photo: "no", copyHint: "HEADLINE = a short topic (max 6 words); point 1 = the common MYTH (max 10 words), point 2 = the FACT that corrects it (max 10 words), point 3 = a short proof or example (max 8 words); CTA 2-4 words" },
  { id: "checklist", label: "Checklist", photo: "no", copyHint: "HEADLINE = a checklist title (max 7 words); the 3 points = three checklist items (max 6 words each); CTA 2-4 words" },
  { id: "split_photo", label: "Split photo and text", photo: "yes", copyHint: "a clear HEADLINE (max 8 words), 3 short points, and a CTA" },
  { id: "offer_badge", label: "Offer badge", photo: "optional", copyHint: "HEADLINE = the offer in a few words (max 7 words, e.g. 'Free audit this week'); the 3 points = what is included or the terms (max 6 words each); CTA 2-4 words that tells the customer what to do" },
  { id: "steps_path", label: "Step by step path", photo: "no", copyHint: "HEADLINE = 'How it works' style title (max 7 words); the 3 points = three ordered steps (max 6 words each, verbs first); CTA 2-4 words" },
  { id: "polaroid", label: "Tilted photo card", photo: "yes", copyHint: "a friendly HEADLINE (max 8 words), 3 short points, and a CTA" },
  { id: "spotlight_chips", label: "Spotlight with chips", photo: "yes", copyHint: "a product-focused HEADLINE (max 7 words), 3 short chip labels (max 3 words each), and a CTA" },
  { id: "type_only", label: "Bold type-only", photo: "no", copyHint: "a bold HEADLINE (max 9 words), 3 short points, and a CTA" },
];

export const POSTER_TEMPLATE_IDS = POSTER_TEMPLATES.map((t) => t.id);

export function posterTemplate(id: string | null | undefined): PosterTemplateInfo | null {
  return POSTER_TEMPLATES.find((t) => t.id === id) ?? null;
}
