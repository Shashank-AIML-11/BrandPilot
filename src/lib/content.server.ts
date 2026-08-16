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

export interface GeneratedPiece {
  title?: string;
  summary?: string;
  body?: string;
  caption?: string;
  hashtags?: string;
  image_prompt?: string;
  script?: string;
  time?: string;
}

export interface GeneratedDay {
  date?: string;
  blog?: GeneratedPiece;
  infographics?: GeneratedPiece[];
  videos?: GeneratedPiece[];
}

export interface DailyContentQuota {
  blog: number;
  infographic: number;
  video: number;
}

/** Evenly distribute a plan's monthly allowance over the available dates. */
export function distributeMonthlyContent(
  dates: string[],
  totals: DailyContentQuota,
): Record<string, DailyContentQuota> {
  const schedule = Object.fromEntries(
    dates.map((date) => [date, { blog: 0, infographic: 0, video: 0 }]),
  ) as Record<string, DailyContentQuota>;

  (Object.keys(totals) as Array<keyof DailyContentQuota>).forEach((type) => {
    const count = Math.min(totals[type], dates.length);
    for (let index = 0; index < count; index += 1) {
      const dateIndex = Math.floor(((index * dates.length) / count);
      schedule[dates[dateIndex]!]![type] += 1;
    }
  });
  return schedule;
}

export const DEFAULT_PLATFORMS = ["LinkedIn", "Instagram", "Facebook", "X"];

/** Where each content type is allowed to be published. */
export const CHANNELS_BY_TYPE: Record<string, string[]> = {
  blog: ["LinkedIn", "Website", "Quora", "Medium"],
  infographic: ["LinkedIn", "X", "Instagram", "Facebook", "Pinterest"],
  video: ["YouTube", "TikTok"],
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
  const allowed = CHANNELS_BY_TYPE[type] ?? [];
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

Blog bodies: 700-1000 words of genuinely useful, expert-level writing in markdown — H2/H3 structure, a strong opening hook,
step-by-step or framework sections the reader could act on today, a short "what this means for you" section, and an explicit CTA to the brand's website.
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

export function weekPrompt(
  brand: BrandRow,
  dates: string[],
  strategy?: StrategyDirective | null,
  quotas?: Record<string, DailyContentQuota>,
): string {
  const requestedContent = dates
    .map((date) => {
      const quota = quotas?.[date] ?? { blog: 1, infographic: 4, video: 2 };
      return `- ${date}: ${quota.blog} blog(s), ${quota.infographic} infographic(s), ${quota.video} video(s)`;
    })
    .join("\n");
  return `${brandContext(brand)}${strategyContext(strategy)}


Create content only for these requested quantities. Do not add any extra pieces:
${requestedContent}

For each requested blog use: { "title", "summary", "body", "caption", "hashtags", "time" }.
For each requested infographic use: { "title", "summary", "caption", "hashtags", "image_prompt", "time" }.
For each requested video use: { "title", "summary", "script", "caption", "hashtags", "image_prompt", "time" }.
When a requested quantity is zero, omit that field or return an empty array.

Rules:
- Every title must reference the brand's own product, service, audience or keyword — no generic titles, no buzzword soup.
- "summary" states which product/service and which value proposition the piece pushes, and who it is for.
- "hashtags" is a single space-separated string of 4-6 hashtags built from the brand's keywords, niche and business name.
- "caption" is a ready-to-post social caption under 280 characters: a scroll-stopping first line, one concrete benefit, one clear CTA, in the brand's tone.
- Video "script" is a 60-90 second spoken script with [HOOK], [BODY], [CTA] markers. Write it as natural narration for a voice-over: complete spoken sentences, a hook in the first 5 seconds, no bullet fragments, and it must name the business and its product/service.
- Video "image_prompt" describes the YouTube thumbnail, including the exact short headline text (max 5 words) to render.
- "image_prompt" for infographics must describe data/steps/benefits drawn from this brand's actual products, services and propositions, with the exact on-image text lines to render.
- "time" is a 24h "HH:MM" posting time; spread posts through the working day.
- Vary angles across the week and never repeat a hook, headline structure or example twice: education, product spotlight, ICP pain point, myth-busting, proof/objection handling, behind-the-scenes, industry insight, offer — always about THIS brand.

Return JSON shaped exactly as:
{ "days": [ { "date": "YYYY-MM-DD", "blog": {...}, "infographics": [ ... ], "videos": [ ... ] } ] }`;
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

export function rowsForDay(
  day: GeneratedDay,
  input: RowInput,
  quota: DailyContentQuota = { blog: 1, infographic: 4, video: 2 },
) {
  const rows: Record<string, unknown>[] = [];
  // Every row must carry the same keys: PostgREST fills missing keys in a bulk
  // insert with NULL instead of the column default, which breaks NOT NULL columns.
  const base = {
    user_id: input.userId,
    scheduled_date: input.date,
    platforms: input.platforms,
    summary: "",
    body: "",
    caption: "",
    hashtags: "",
    image_prompt: "",
    video_script: "",
    autopost: input.autopost ?? false,
  };

  if (day.blog && quota.blog > 0) {
    rows.push({
      ...base,
      type: "blog",
      platforms: platformsForType(input.platforms, "blog"),
      title: clean(day.blog.title, "Untitled blog"),
      summary: clean(day.blog.summary),
      body: clean(day.blog.body),
      caption: clean(day.blog.caption),
      hashtags: clean(day.blog.hashtags),
      scheduled_time: timeOf(day.blog, "08:00"),
    });
  }


  const infoTimes = ["10:00", "12:30", "15:00", "18:30"];
  (day.infographics ?? []).slice(0, quota.infographic).forEach((piece, i) => {
    rows.push({
      ...base,
      type: "infographic",
      platforms: platformsForType(input.platforms, "infographic"),
      title: clean(piece.title, `Infographic ${i + 1}`),
      summary: clean(piece.summary),
      caption: clean(piece.caption),
      hashtags: clean(piece.hashtags),
      image_prompt: clean(piece.image_prompt),
      scheduled_time: timeOf(piece, infoTimes[i] ?? "12:00"),
    });
  });

  const videoTimes = ["11:00", "17:00"];
  (day.videos ?? []).slice(0, quota.video).forEach((piece, i) => {
    rows.push({
      ...base,
      type: "video",
      platforms: platformsForType(input.platforms, "video"),
      title: clean(piece.title, `Video ${i + 1}`),
      summary: clean(piece.summary),
      caption: clean(piece.caption),
      hashtags: clean(piece.hashtags),
      image_prompt: clean(piece.image_prompt),
      video_script: clean(piece.script),

      scheduled_time: timeOf(piece, videoTimes[i] ?? "16:00"),
    });
  });

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
  if (item.type === "video") {
    return `YouTube thumbnail, 16:9 composition, bold legible headline text, high contrast, professional marketing design. ${base}${brandLine}${SAFETY_IMAGE_SUFFIX}`;
  }
  return [
    "Premium, agency-grade marketing infographic poster for social media, square 1:1.",
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


/** Builds a cinematic, brand-grounded prompt for real AI video generation. */
export function videoPromptFor(
  item: { title: string; summary: string; video_script: string; image_prompt: string },
  brand?: Partial<BrandRow> | null,
): string {
  const beats = narrationFromScript(item.video_script || "", `${item.title}. ${item.summary}`).slice(
    0,
    900,
  );
  const business = brand?.business_name || "the brand";
  const offering = (brand?.products_services || brand?.description || "").slice(0, 300);
  const tone = brand?.tone || "professional, warm, modern";
  return [
    `Cinematic live-action lifestyle commercial for ${business}.`,
    offering ? `The business offers: ${offering}.` : "",
    brand?.icp ? `Featuring real people who match this audience: ${String(brand.icp).slice(0, 200)}.` : "",
    `Story beats to show visually: ${beats}`,
    `Style: photoreal handheld and smooth gimbal shots, natural daylight, shallow depth of field, authentic candid people, 2-3 quick scene cuts, colour grade matching a ${tone} brand feel.`,
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
