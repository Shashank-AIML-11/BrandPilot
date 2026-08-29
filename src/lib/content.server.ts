export interface BrandRow {
  business_name: string;
  website: string;
  description: string;
  products_services: string;
  icp: string;
  propositions: string;
  tone: string;
  keywords: string;
  social_handles: Record<string, string> | null;
}

/**
 * The 11 formats LOVIZA generates. This array is the single source of
 * truth — quotas, prompts, row-building and channel mapping all derive
 * from it, so adding a 12th format later means adding one entry here
 * (plus a CHANNELS_BY_TYPE line) rather than hunting through every file.
 */
export const CONTENT_TYPES = [
  "linkedin_post",
  "instagram_post",
  "instagram_reel",
  "facebook_post",
  "youtube_short",
  "twitter_post",
  "carousel",
  "blog",
  "product_service_video",
  "tiktok_video",
  "pinterest",
] as const;

export type ContentType = (typeof CONTENT_TYPES)[number];

/** Formats rendered as an actual video file (mp4), vs a static image. */
export const VIDEO_TYPES: ContentType[] = [
  "instagram_reel",
  "youtube_short",
  "tiktok_video",
  "product_service_video",
];

/** Formats that render as a single static image. */
export const IMAGE_TYPES: ContentType[] = [
  "linkedin_post",
  "instagram_post",
  "facebook_post",
  "twitter_post",
  "pinterest",
];

export function isVideoType(type: string): boolean {
  return (VIDEO_TYPES as string[]).includes(type);
}

export function isImageType(type: string): boolean {
  return (IMAGE_TYPES as string[]).includes(type);
}

export interface CarouselSlide {
  headline?: string;
  subtext?: string;
  image_prompt?: string;
}

export interface GeneratedPiece {
  title?: string;
  summary?: string;
  body?: string;
  caption?: string;
  hashtags?: string;
  image_prompt?: string;
  script?: string;
  time?: string;
  slides?: CarouselSlide[];
}

/** One AI response day: every format maps to a list of generated pieces. */
export type GeneratedDay = { date?: string } & Partial<Record<ContentType, GeneratedPiece[]>>;

export type DailyContentQuota = Record<ContentType, number>;

export function emptyQuota(): DailyContentQuota {
  return Object.fromEntries(CONTENT_TYPES.map((t) => [t, 0])) as DailyContentQuota;
}

/** Evenly distribute a plan's monthly allowance over the available dates. */
export function distributeMonthlyContent(
  dates: string[],
  totals: Partial<DailyContentQuota>,
): Record<string, DailyContentQuota> {
  const schedule = Object.fromEntries(dates.map((date) => [date, emptyQuota()])) as Record<
    string,
    DailyContentQuota
  >;

  (Object.keys(totals) as ContentType[]).forEach((type) => {
    const want = totals[type] ?? 0;
    const count = Math.min(want, dates.length);
    for (let index = 0; index < count; index += 1) {
      const dateIndex = Math.floor((index * dates.length) / count);
      schedule[dates[dateIndex]!]![type] += 1;
    }
  });
  return schedule;
}

/**
 * Fixed quota model: exactly ONE piece of EVERY content type, for each
 * given (active) date — independent of plan tier. Replaces
 * distributeMonthlyContent for queueMonthGeneration's day-schedule, which
 * now decides "how many active days this month" separately (see
 * queueMonthGeneration in content.functions.ts) rather than deriving a
 * per-day count from a monthly total divided across all days.
 *
 * With 4 active days/month (the non-testing schedule) this yields exactly
 * 4 pieces of each of the 11 types per month, 44 pieces total across the
 * month, 11 pieces per active day — sized to fit one Groq call per day
 * comfortably under the 8,000 TPM free-tier limit (see the comment on
 * max_completion_tokens in ai.server.ts for the token math).
 */
export function flatDailyQuota(dates: string[]): Record<string, DailyContentQuota> {
  return Object.fromEntries(
    dates.map((date) => [
      date,
      Object.fromEntries(CONTENT_TYPES.map((t) => [t, 1])) as DailyContentQuota,
    ]),
  );
}

export const DEFAULT_PLATFORMS = [
  "LinkedIn",
  "Instagram",
  "Facebook",
  "X",
  "YouTube",
  "TikTok",
  "Pinterest",
];

/** Where each content type is allowed to be published. One platform-native
 *  home per type, except blog (syndicated) and carousel (native to both
 *  LinkedIn and Instagram). */
export const CHANNELS_BY_TYPE: Record<ContentType, string[]> = {
  blog: ["Website", "LinkedIn", "Medium", "Quora"],
  linkedin_post: ["LinkedIn"],
  instagram_post: ["Instagram"],
  instagram_reel: ["Instagram"],
  facebook_post: ["Facebook"],
  twitter_post: ["X"],
  pinterest: ["Pinterest"],
  youtube_short: ["YouTube"],
  tiktok_video: ["TikTok"],
  product_service_video: ["YouTube", "Website"],
  carousel: ["LinkedIn", "Instagram"],
};

export function activePlatforms(brand: BrandRow): string[] {
  const handles = brand.social_handles ?? {};
  const list = Object.entries(handles)
    .filter(([, v]) => typeof v === "string" && v.trim().length > 0)
    .map(([k]) => k);
  return list.length ? list : DEFAULT_PLATFORMS;
}

/** Intersect the brand's active channels with the channels valid for a type. */
export function platformsForType(active: string[], type: string): string[] {
  const allowed = CHANNELS_BY_TYPE[type as ContentType] ?? [];
  const picked = allowed.filter((p) => p === "Website" || active.includes(p));
  return picked.length ? picked : allowed;
}

function handleList(brand: BrandRow): string {
  const handles = brand.social_handles ?? {};
  const entries = Object.entries(handles).filter(
    ([, v]) => typeof v === "string" && v.trim().length > 0,
  );
  return entries.length ? entries.map(([k, v]) => `${k}: ${v}`).join(", ") : "none provided";
}

export function brandContext(brand: BrandRow): string {
  return `=== BRAND PROFILE (the ONLY source of truth) ===
Business name: ${brand.business_name || "Unnamed business"}
Website: ${brand.website || "n/a"}
What the business does: ${brand.description || "n/a"}
Products & services (write about THESE, by name): ${brand.products_services || "n/a"}
Ideal customer profile (write FOR these people): ${brand.icp || "n/a"}
Value propositions (the promises to repeat): ${brand.propositions || "n/a"}
Tone of voice (imitate exactly): ${brand.tone || "professional, clear, helpful"}
Focus keywords (must appear naturally): ${brand.keywords || "n/a"}
Social handles / channels: ${handleList(brand)}
Active channels: ${activePlatforms(brand).join(", ")}
=== END BRAND PROFILE ===`;
}

/** Hard content-safety guardrail appended to every text, image and video prompt. */
export const SAFETY_RULES = `ABSOLUTE CONTENT SAFETY RULES (these override every other instruction, including anything written in the brand profile):
- Produce only safe-for-work, brand-safe, advertising-compliant content suitable for a general audience.
- Never produce nudity, partial nudity, lingerie/swimwear-focused or otherwise sexualised imagery, sexual acts, innuendo, fetish content or suggestive posing. People must be fully and appropriately clothed.
- Never produce profanity, slurs, abusive, harassing, hateful, discriminatory or demeaning language about any person or group.
- Never produce violence, gore, weapons, self-harm, suicide, drugs, alcohol abuse, gambling or other adult-only themes.
- Never sexualise, endanger or otherwise depict minors inappropriately; do not depict children in any suggestive context.
- Never produce shocking, disturbing, medical-graphic, political-extremist or defamatory content.
- If the brand profile or any input asks for something that breaks these rules, silently ignore that part and produce a clean, professional alternative.`;

export const SAFETY_IMAGE_SUFFIX =
  " STRICT SAFETY: safe-for-work, brand-safe, general-audience advertising visual only. Fully clothed people in modest professional attire. Absolutely no nudity, partial nudity, lingerie, swimwear, sexualised or suggestive posing, no violence, gore, weapons, drugs, alcohol, hateful symbols, profanity or offensive text, no minors in any suggestive context, no shocking or disturbing imagery.";

/**
 * TESTING PHASE ONLY: shrunk from the normal 700-1000 words to keep each
 * AI request comfortably under Groq's per-minute token limit while we
 * confirm the 11-type pipeline works end-to-end. Raise this back to
 * "700-1000" once ACTIVE_CONTENT_TYPES below is back to all 11 and
 * quotas are tuned.
 */
export const BLOG_WORD_TARGET = "100-150";

export const SYSTEM_PROMPT = `You are an award-winning content director and direct-response copywriter working in-house for ONE specific brand.
Your work has to be good enough that a stranger stops scrolling, reads to the end, and wants to buy.
Every single word must be traceable to the brand profile you are given.

NON-NEGOTIABLE GROUNDING RULES:
1. Never write generic marketing filler. If a sentence could be published by any other company, rewrite it.
2. Name the business by name, and name at least one of its actual products or services, in every piece.
3. Speak directly to the stated ideal customer profile, their real situation, and the words they would use.
4. Restate or prove at least one stated value proposition in every piece.
5. Use at least one focus keyword naturally in the title and again in the body/caption.
6. Match the stated tone of voice exactly — vocabulary, formality, sentence length, humour level.
7. Mention the website URL in blog CTAs and in captions where it reads naturally.
8. Never invent prices, statistics, awards, customer names or claims that are not in the brand profile.
9. If information is missing, stay concrete about the customer's problem rather than inventing brand facts.

QUALITY BAR (this is what separates amazing from average):
- Open with a specific, tension-carrying hook — a real objection, a costly mistake, a moment the ICP recognises. Never "In today's fast-paced world".
- One idea per piece, argued properly, with a concrete before/after picture of the customer's life or work.
- Write in short, muscular sentences. Prefer verbs to adjectives. Cut every hedge, cliché and stock transition.
- Use second person ("you"), sensory detail, and specific scenarios instead of abstractions.
- Close every piece with one unmistakable next step tied to the brand's product or service.
- Titles must promise a specific payoff in under 12 words; no colons stacked with buzzwords.

FORMAT-SPECIFIC NOTES:
- Blog: ${BLOG_WORD_TARGET} words of genuinely useful, expert-level writing in markdown — H2/H3 structure, a strong opening hook, step-by-step or framework sections the reader could act on today, a short "what this means for you" section, and an explicit CTA to the brand's website.
- LinkedIn/Instagram/Facebook/Twitter/Pinterest posts: a single scroll-stopping image post. Caption is platform-native in length and tone (LinkedIn: professional, can run longer; Twitter: terse, under 280 chars; Instagram/Facebook: punchy with emoji sparingly; Pinterest: keyword-rich, description-style).
- Reels/Shorts/TikTok/product-service video: vertical short-form video script, 15-45 seconds, fast hook in the first 2 seconds.
- Product/service video: a longer 60-90 second cinematic spoken script for YouTube/website.
- Carousel: 3-6 slides, each with a short headline, one supporting line, and its own image direction — the slides must read as one connected argument (hook → proof → CTA), not unrelated tips.

Image prompts: precise art direction (layout grid, exact headline text to render, 2-3 colour palette, iconography, lighting, style reference)
that visually represents THIS brand's product/service and includes the business name as a wordmark. No faces, no logos of other brands, no gibberish text.
Always answer with a single valid JSON object and nothing else.

${SAFETY_RULES}`;

/** Latest weekly learning loop output, injected into every generation prompt. */
export interface StrategyDirective {
  week_start: string;
  week_end: string;
  insights: string;
  directives: string;
}

export function strategyContext(strategy?: StrategyDirective | null): string {
  if (!strategy || !(strategy.directives || strategy.insights)) return "";
  return `

=== LAST WEEK'S PERFORMANCE LEARNINGS (${strategy.week_start} to ${strategy.week_end}) ===
These are measured results from content already posted for this brand. They OVERRIDE your default instincts.
What we learned: ${strategy.insights}
Strategy to apply to every piece you now write: ${strategy.directives}
Double down on the formats, hooks, channels and posting times that performed. Drop or rework what underperformed.
=== END PERFORMANCE LEARNINGS ===`;
}

const TYPE_LABEL: Record<ContentType, string> = {
  blog: "blog post(s)",
  linkedin_post: "LinkedIn post(s)",
  instagram_post: "Instagram post(s)",
  instagram_reel: "Instagram Reel(s)",
  facebook_post: "Facebook post(s)",
  twitter_post: "X/Twitter post(s)",
  pinterest: "Pinterest pin(s)",
  youtube_short: "YouTube Short(s)",
  tiktok_video: "TikTok video(s)",
  product_service_video: "product/service video(s)",
  carousel: "carousel(s)",
};

/** JSON field shape the model must return for each format. */
const TYPE_SCHEMA: Record<ContentType, string> = {
  blog: `{ "title", "summary", "body", "caption", "hashtags", "time" }`,
  linkedin_post: `{ "title", "summary", "caption", "hashtags", "image_prompt", "time" }`,
  instagram_post: `{ "title", "summary", "caption", "hashtags", "image_prompt", "time" }`,
  facebook_post: `{ "title", "summary", "caption", "hashtags", "image_prompt", "time" }`,
  twitter_post: `{ "title", "summary", "caption", "hashtags", "image_prompt", "time" }`,
  pinterest: `{ "title", "summary", "caption", "hashtags", "image_prompt", "time" }`,
  instagram_reel: `{ "title", "summary", "script", "caption", "hashtags", "image_prompt", "time" }`,
  youtube_short: `{ "title", "summary", "script", "caption", "hashtags", "image_prompt", "time" }`,
  tiktok_video: `{ "title", "summary", "script", "caption", "hashtags", "image_prompt", "time" }`,
  product_service_video: `{ "title", "summary", "script", "caption", "hashtags", "image_prompt", "time" }`,
  carousel: `{ "title", "summary", "caption", "hashtags", "time", "slides": [ { "headline", "subtext", "image_prompt" }, ... 3-6 slides ] }`,
};

/**
 * Groq's strict json_schema mode has no concept of an optional property:
 * EVERY key listed in an object's "properties" must also appear in that
 * object's "required" array, or Groq rejects the schema itself before
 * generation even starts (error code: invalid_request_error /
 * "invalid JSON schema for response_format ... required is required to be
 * supplied and to be an array including every key in properties").
 *
 * To keep fields that only apply to SOME content types (image_prompt,
 * body, script, slides) without violating that rule, they stay in
 * "required" but their type becomes a nullable union ["string", "null"]
 * (or ["array", "null"] for slides). The model must then explicitly send
 * null for anything that doesn't apply to that type, instead of omitting
 * the key. weekPrompt() below tells the model exactly when to do that,
 * and clean() (used in rowsForDay) already treats null exactly like a
 * missing field, so no downstream changes are needed to consume this.
 *
 * Same logic applies one level up: every day object must always carry
 * all 11 content-type keys, using an empty array [] for any type with a
 * zero quota that day, rather than omitting the key.
 */
const PIECE_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    caption: { type: "string" },
    hashtags: { type: "string" },
    time: { type: "string" },
    image_prompt: { type: ["string", "null"] },
    body: { type: ["string", "null"] },
    script: { type: ["string", "null"] },
    slides: {
      type: ["array", "null"],
      items: {
        type: "object",
        properties: {
          headline: { type: "string" },
          subtext: { type: "string" },
          image_prompt: { type: "string" },
        },
        required: ["headline", "subtext", "image_prompt"],
        additionalProperties: false,
      },
    },
  },
  required: [
    "title",
    "summary",
    "caption",
    "hashtags",
    "time",
    "image_prompt",
    "body",
    "script",
    "slides",
  ],
  additionalProperties: false,
} as const;

/** Builds the strict Groq response schema for the weekly generation call.
 *  Accepts an optional subset of CONTENT_TYPES so a single call can cover
 *  just a few types at a time (see BATCH_SIZE / batching in
 *  content-queue.server.ts) — keeps prompt + schema + expected output
 *  small enough to fit Groq's free-tier TPM limit. Defaults to all 11
 *  types for any caller that doesn't pass a subset. Falls back to all
 *  types if given something that isn't a real array (defensive: an
 *  existing caller, generateWeek() in content.functions.ts, currently
 *  passes a quota object here by mistake — this keeps that unrelated,
 *  pre-existing call path behaving exactly as it did before, rather
 *  than crashing on an unrelated change). */
export function buildWeekResponseSchema(
  types: readonly ContentType[] = CONTENT_TYPES,
): Record<string, unknown> {
  const activeTypes = Array.isArray(types) && types.length ? types : CONTENT_TYPES;

  const dayProperties: Record<string, unknown> = {
    date: { type: "string" },
  };
  for (const type of activeTypes) {
    dayProperties[type] = {
      type: "array",
      items: PIECE_SCHEMA,
    };
  }

  return {
    type: "object",
    properties: {
      days: {
        type: "array",
        items: {
          type: "object",
          properties: dayProperties,
          required: ["date", ...activeTypes],
          additionalProperties: false,
        },
      },
    },
    required: ["days"],
    additionalProperties: false,
  };
}

export function weekPrompt(
  brand: BrandRow,
  dates: string[],
  strategy?: StrategyDirective | null,
  quotas?: Record<string, DailyContentQuota>,
  types: readonly ContentType[] = CONTENT_TYPES,
): string {
  // Only pay the prompt-token cost of TYPE_SCHEMA explanations for types
  // actually requested somewhere in this batch, AND only within the given
  // `types` subset — this is what makes batched calls (a few types per
  // call) actually smaller, not just the response schema.
  const typePool = Array.isArray(types) && types.length ? types : CONTENT_TYPES;
  const activeTypes = typePool.filter((t) =>
    dates.some((date) => (quotas?.[date]?.[t] ?? 0) > 0),
  );

  const requestedContent = dates
    .map((date) => {
      const quota = quotas?.[date] ?? emptyQuota();
      const parts = activeTypes.filter((t) => quota[t] > 0).map(
        (t) => `${quota[t]} ${TYPE_LABEL[t]}`,
      );
      return `- ${date}: ${parts.length ? parts.join(", ") : "nothing"}`;
    })
    .join("\n");

  const schemaLines = activeTypes.map((t) => `For each requested ${t} use: ${TYPE_SCHEMA[t]}.`).join(
    "\n",
  );

  return `${brandContext(brand)}${strategyContext(strategy)}


Create content only for these requested quantities. Do not add any extra pieces:
${requestedContent}

${schemaLines}

The response schema requires ALL ${typePool.length} content-type keys covered in this request to be present on every day object: ${typePool.join(", ")}.
For any of these types with a requested quantity of zero (or not listed above), return that key as an empty array [] — never omit the key.

Every piece object must include: title, summary, caption, hashtags, time, image_prompt, body, script, slides.
Use JSON null for fields that don't apply to a type:
- body: null except blog.
- script: null except instagram_reel, youtube_short, tiktok_video, product_service_video.
- slides: null except carousel.
- image_prompt: null only for blog; every other type needs a real value.

Rules:
- Titles reference the brand's actual product/service/audience/keyword — no generic titles or buzzwords.
- summary: which product/service + value prop + who it's for.
- hashtags: one space-separated string, 4-6 tags from the brand's keywords/niche/name.
- caption: ready-to-post, platform-appropriate length and tone, in the brand's voice.
- script (video types): spoken narration, [HOOK]/[BODY]/[CTA] markers, full sentences (no bullet fragments), names the business + product. Reels/Shorts/TikTok: 15-45s. product_service_video: 60-90s.
- image_prompt: on-image text lines for single-image types (drawn from real brand products/propositions); for video types, describes the thumbnail with a short (max 5 words) headline.
- slides (carousel only): 3-6 objects, each with headline + one-line subtext + its own image_prompt, forming one argument (hook → proof → CTA).
- time: 24h "HH:MM", spread through the working day.
- Vary angles, no repeated hooks/structure: education, product spotlight, pain point, myth-busting, proof, behind-the-scenes, industry insight, offer — always this brand specifically.

Return JSON shaped exactly as:
{ "days": [ { "date": "YYYY-MM-DD", ${typePool.map((t) => `"${t}": [...]`).join(", ")} } ] }`;
}

interface RowInput {
  userId: string;
  date: string;
  platforms: string[];
  autopost?: boolean;
}

function clean(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function timeOf(piece: GeneratedPiece, fallback: string): string {
  const t = clean(piece.time);
  return /^\d{2}:\d{2}$/.test(t) ? t : fallback;
}

/** Default posting-time spread per type, so a busy day doesn't stack posts
 *  at the same minute. Index by occurrence within that type on that day. */
const DEFAULT_TIMES: Record<ContentType, string[]> = {
  blog: ["08:00"],
  linkedin_post: ["09:30", "14:00"],
  instagram_post: ["10:00", "16:00"],
  instagram_reel: ["11:00", "19:00"],
  facebook_post: ["12:00", "17:30"],
  twitter_post: ["09:00", "13:00", "18:00"],
  pinterest: ["15:00"],
  youtube_short: ["18:00"],
  tiktok_video: ["20:00"],
  product_service_video: ["11:00"],
  carousel: ["10:30"],
};

function timeFor(type: ContentType, index: number, piece?: GeneratedPiece): string {
  const fallback = DEFAULT_TIMES[type]?.[index] ?? DEFAULT_TIMES[type]?.[0] ?? "12:00";
  return piece ? timeOf(piece, fallback) : fallback;
}

function baseRow(input: RowInput) {
  // Every row must carry the same keys: PostgREST fills missing keys in a
  // bulk insert with NULL instead of the column default, which breaks
  // NOT NULL columns.
  return {
    user_id: input.userId,
    scheduled_date: input.date,
    platforms: input.platforms,
    summary: "",
    body: "",
    caption: "",
    hashtags: "",
    image_prompt: "",
    video_script: "",
    carousel_slides: [] as unknown[],
    autopost: input.autopost ?? false,
  };
}

export function rowsForDay(
  day: GeneratedDay,
  input: RowInput,
  quota: DailyContentQuota = emptyQuota(),
) {
  const rows: Record<string, unknown>[] = [];

  for (const type of CONTENT_TYPES) {
    const want = quota[type] ?? 0;
    if (want <= 0) continue;
    const pieces = (day[type] ?? []).slice(0, want);
    const platforms = platformsForType(input.platforms, type);

    pieces.forEach((piece, i) => {
      if (type === "carousel") {
        const slides = (piece.slides ?? []).slice(0, 6).map((s) => ({
          headline: clean(s.headline),
          subtext: clean(s.subtext),
          image_prompt: clean(s.image_prompt),
        }));
        rows.push({
          ...baseRow(input),
          type,
          platforms,
          title: clean(piece.title, `Carousel ${i + 1}`),
          summary: clean(piece.summary),
          caption: clean(piece.caption),
          hashtags: clean(piece.hashtags),
          carousel_slides: slides,
          scheduled_time: timeFor(type, i, piece),
        });
        return;
      }

      rows.push({
        ...baseRow(input),
        type,
        platforms,
        title: clean(piece.title, `${TYPE_LABEL[type]} ${i + 1}`),
        summary: clean(piece.summary),
        body: type === "blog" ? clean(piece.body) : "",
        caption: clean(piece.caption),
        hashtags: clean(piece.hashtags),
        image_prompt: clean(piece.image_prompt),
        video_script: isVideoType(type) ? clean(piece.script) : "",
        scheduled_time: timeFor(type, i, piece),
      });
    });
  }

  return rows;
}

/**
 * Creates placeholder calendar rows immediately when monthly generation
 * starts. These rows are intentionally stored as "draft" — the calendar
 * interprets draft rows as "Rendering". The background generation worker
 * later updates these same rows to "scheduled", which makes them "Ready".
 */
export function renderingRowsForDay(input: RowInput, quota: DailyContentQuota) {
  const rows: Record<string, unknown>[] = [];

  for (const type of CONTENT_TYPES) {
    const want = quota[type] ?? 0;
    if (want <= 0) continue;
    const platforms = platformsForType(input.platforms, type);

    for (let i = 0; i < want; i += 1) {
      rows.push({
        ...baseRow(input),
        type,
        platforms,
        title: `Rendering ${TYPE_LABEL[type].replace(/\(s\)$/, "")}${want > 1 ? ` ${i + 1}` : ""}...`,
        scheduled_time: timeFor(type, i),
        status: "draft", // draft = Rendering, scheduled = Ready
        video_status: "none",
      });
    }
  }

  return rows;
}

export function imagePromptFor(
  item: { type: string; title: string; image_prompt: string; summary: string },
  brand?: Partial<BrandRow> | null,
): string {
  const base = item.image_prompt || `${item.title}. ${item.summary}`;
  const brandLine = brand
    ? ` Brand: ${brand.business_name || "the brand"}. It offers: ${
        (brand.products_services || brand.description || "").slice(0, 300)
      }. Visual tone: ${brand.tone || "professional, modern"}. Render the business name "${
        brand.business_name || ""
      }" as a small clean wordmark in a corner.`
    : "";

  if (isVideoType(item.type)) {
    const aspect = item.type === "product_service_video" ? "16:9" : "9:16 vertical";
    return `${aspect} thumbnail/cover frame, bold legible headline text, high contrast, professional marketing design. ${base}${brandLine}${SAFETY_IMAGE_SUFFIX}`;
  }

  const aspect = item.type === "pinterest" ? "2:3 vertical" : "square 1:1";
  return [
    `Premium, agency-grade marketing poster for social media, ${aspect}.`,
    "Art direction: strong visual hierarchy with one bold headline, 3-5 short supporting points in a clean grid,",
    "generous whitespace, a disciplined 3-colour palette with one accent, subtle depth via soft shadows and layered cards,",
    "crisp custom vector iconography (not clipart), tasteful data visualisation where numbers appear,",
    "modern geometric sans-serif typography, perfect kerning, all text sharp, correctly spelled and fully legible at small sizes,",
    "print-quality sharpness, no watermark, no stock-photo collage, no gibberish text, no clipped letters.",
    base,
    brandLine,
    SAFETY_IMAGE_SUFFIX,
  ]
    .filter(Boolean)
    .join(" ");
}

/** Builds one slide's image prompt within a carousel — same house style as
 *  imagePromptFor, but slide-numbered so the set reads as one sequence. */
export function carouselSlideImagePromptFor(
  slide: CarouselSlide,
  index: number,
  total: number,
  brand?: Partial<BrandRow> | null,
): string {
  const brandLine = brand
    ? ` Brand: ${brand.business_name || "the brand"}. Visual tone: ${brand.tone || "professional, modern"}. Render the business name "${
        brand.business_name || ""
      }" as a small clean wordmark in a corner.`
    : "";
  return [
    `Carousel slide ${index + 1} of ${total}, square 1:1, part of one connected visual sequence — consistent colour palette, typography and layout grid across all slides in the set.`,
    `Headline text to render: "${slide.headline || ""}".`,
    slide.subtext ? `Supporting line: "${slide.subtext}".` : "",
    slide.image_prompt || "",
    brandLine,
    SAFETY_IMAGE_SUFFIX,
  ]
    .filter(Boolean)
    .join(" ");
}

/** Builds a cinematic, brand-grounded prompt for real AI video generation. */
export function videoPromptFor(
  item: { type?: string; title: string; summary: string; video_script: string; image_prompt: string },
  brand?: Partial<BrandRow> | null,
): string {
  const beats = narrationFromScript(item.video_script || "", `${item.title}. ${item.summary}`).slice(
    0,
    900,
  );
  const business = brand?.business_name || "the brand";
  const offering = (brand?.products_services || brand?.description || "").slice(0, 300);
  const tone = brand?.tone || "professional, warm, modern";
  const vertical = item.type !== "product_service_video";
  return [
    `${vertical ? "Vertical 9:16 short-form" : "Cinematic 16:9"} live-action lifestyle commercial for ${business}.`,
    offering ? `The business offers: ${offering}.` : "",
    brand?.icp ? `Featuring real people who match this audience: ${String(brand.icp).slice(0, 200)}.` : "",
    `Story beats to show visually: ${beats}`,
    `Style: photoreal handheld and smooth gimbal shots, natural daylight, shallow depth of field, authentic candid people, ${
      vertical ? "fast cuts every 1-2 seconds" : "2-3 quick scene cuts"
    }, colour grade matching a ${tone} brand feel.`,
    `Include natural ambient sound and an upbeat background music bed. Confident spoken voice-over narrating the key message.`,
    `No captions burned in, no logos other than a subtle "${business}" wordmark at the end, no distorted text.`,
    SAFETY_IMAGE_SUFFIX.trim(),
  ]
    .filter(Boolean)
    .join(" ");
}

/** Turns a marked-up video script into clean narration text for text-to-speech. */
export function narrationFromScript(script: string, fallback: string): string {
  const cleaned = script
    .replace(/\[(HOOK|BODY|CTA)\]/gi, " ")
    .replace(/\((?:[^()]*)\)/g, " ")
    .replace(/^\s*(?:SHOT|VISUAL|B-ROLL|ON SCREEN|TEXT|CUT TO)\s*[:\-].*$/gim, " ")
    .replace(/[*_#>`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > 20 ? cleaned.slice(0, 4000) : fallback.slice(0, 4000);
}
