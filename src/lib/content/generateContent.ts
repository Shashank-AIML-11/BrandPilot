import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  getBrandContext,
  formatBrandContextForPrompt,
} from './buildBrandContext';
import { createClient } from '@supabase/supabase-js';

/**
 * LOVIZA AI Content Generator
 *
 * IMPORTANT:
 * This file generates the CONTENT / SCRIPT / PROMPT.
 *
 * It does NOT itself render:
 * - an actual image
 * - an actual video
 * - an actual Instagram Reel MP4
 * - an actual YouTube Short MP4
 *
 * Those should be handled by the existing image/video generation
 * pipelines after this function returns.
 */

const genAI = new GoogleGenerativeAI(
  process.env.LOVIZA_GEMINI_API_KEY!
);

/**
 * All content types supported by the LOVIZA content generator.
 */
export type LOVIZAContentType =
  | 'blog'
  | 'infographic'
  | 'video'
  | 'linkedin_post'
  | 'instagram_post'
  | 'instagram_reel'
  | 'facebook_post'
  | 'youtube_short'
  | 'carousel'
  | 'email'
  | 'ad_image'
  | 'product_video';

/**
 * Parameters accepted by the generator.
 */
interface GenerateContentParams {
  supabase: ReturnType<typeof createClient>;
  userId: string;
  contentType: LOVIZAContentType;
  topic?: string;
}

/**
 * Standard response structure.
 *
 * We intentionally retain the old fields so existing callers
 * expecting title/body/caption/hashtags/imagePrompt continue
 * to work.
 */
export interface GeneratedContent {
  title: string;
  body: string;
  caption: string;
  hashtags: string;
  imagePrompt?: string;

  /**
   * Useful for video-based content.
   */
  videoPrompt?: string;

  /**
   * Useful for carousel content.
   */
  slides?: Array<{
    slideNumber: number;
    title: string;
    text: string;
    visualPrompt: string;
  }>;

  /**
   * Useful for email content.
   */
  emailSubject?: string;
  emailPreviewText?: string;

  /**
   * Useful for ad content.
   */
  adHeadline?: string;
  adPrimaryText?: string;
  adCallToAction?: string;

  /**
   * Identifies what the generator produced.
   */
  contentType?: LOVIZAContentType;
}

/**
 * Instructions for every supported content type.
 */
const typeInstructions: Record<LOVIZAContentType, string> = {

  blog: `
Write a high-quality brand blog article.

Requirements:
- 500-800 words.
- Strong SEO-friendly title.
- Clear introduction.
- Use useful headings.
- Provide practical value.
- Naturally mention the brand's products/services.
- Avoid making unsupported claims.
- End with a clear but non-aggressive call-to-action.
`,

  infographic: `
Create content for a visual infographic.

Requirements:
- Punchy title under 8 words.
- 4-6 concise information points.
- Each point should be suitable for on-image text.
- Include a short social caption.
- Provide a detailed imagePrompt describing the infographic layout,
  visual hierarchy, icons, typography direction and brand-relevant imagery.
`,

  video: `
Create a general short-form marketing video.

Requirements:
- 30-45 seconds.
- Start with a powerful hook.
- Explain one useful idea or benefit.
- Keep the language natural for spoken delivery.
- Include a closing call-to-action.
- Provide a videoPrompt describing the visual scenes.
`,

  linkedin_post: `
Create a professional LinkedIn post.

Requirements:
- Strong first-line hook.
- 150-250 words.
- Professional but conversational tone.
- Focus on insight, business value, expertise or customer pain point.
- Use short paragraphs for LinkedIn readability.
- Do not overuse emojis.
- End with an engaging question or soft CTA.
- Include 3-6 relevant hashtags.
`,

  instagram_post: `
Create an engaging Instagram feed post.

Requirements:
- Strong attention-grabbing opening.
- 80-180 words.
- Conversational and visually descriptive.
- Highlight the brand/product/service benefit.
- Include a clear CTA.
- Include 5-10 relevant hashtags.
- Provide an imagePrompt suitable for generating the accompanying image.
`,

  instagram_reel: `
Create a complete Instagram Reel concept.

Requirements:
- 20-45 seconds.
- Provide a strong first 2-second hook.
- Break the script into short spoken/visual beats.
- Include on-screen text suggestions.
- Include a CTA.
- Provide a detailed videoPrompt describing scenes,
  camera movement, visual style and transitions.
- The script must be suitable for vertical 9:16 video.
`,

  facebook_post: `
Create an engaging Facebook post.

Requirements:
- 100-220 words.
- Friendly and easy to understand.
- Explain the customer benefit clearly.
- Encourage comments, reactions or clicks.
- Include a clear CTA.
- Include 3-8 relevant hashtags.
`,

  youtube_short: `
Create a YouTube Short script.

Requirements:
- 30-60 seconds.
- Extremely strong first 3 seconds.
- Fast-paced and easy to understand.
- One clear idea per Short.
- Include spoken narration.
- Include suggested on-screen text.
- End with a CTA.
- Provide a detailed vertical 9:16 videoPrompt.
`,

  carousel: `
Create a social-media carousel.

Requirements:
- 6-8 slides.
- Slide 1 must be a powerful hook.
- Each slide must communicate ONE idea.
- Keep slide text short and readable.
- Final slide should contain a CTA.
- Provide a visualPrompt for every slide.
- Suitable for LinkedIn, Instagram and Facebook.
`,

  email: `
Create a personalized marketing email.

Requirements:
- Write a compelling subject line.
- Write preview text.
- Personalize around the target customer's likely needs.
- Explain the brand's value clearly.
- Avoid spammy language.
- Include one primary CTA.
- Keep the email concise and conversion-focused.
`,

  ad_image: `
Create copy and a visual concept for a paid advertising image.

Requirements:
- Strong ad headline.
- Short primary ad text.
- Clear CTA.
- Focus on one product/service benefit.
- Avoid unsupported numerical claims.
- Provide a detailed imagePrompt for the advertising creative.
- Image should be suitable for Facebook, Instagram or LinkedIn advertising.
`,

  product_video: `
Create a product/service promotional video.

Requirements:
- 30-60 seconds.
- Start with the customer's problem.
- Introduce the product/service.
- Explain the key benefits.
- Show how it works.
- Finish with a strong CTA.
- Provide scene-by-scene video direction.
- Provide a detailed videoPrompt suitable for a video generation model.
`,
};

/**
 * Generate content using the user's brand context.
 */
export async function generateContent({
  supabase,
  userId,
  contentType,
  topic,
}: GenerateContentParams): Promise<GeneratedContent> {

  if (!process.env.LOVIZA_GEMINI_API_KEY) {
    throw new Error(
      'LOVIZA_GEMINI_API_KEY is not configured.'
    );
  }

  const brandContext = await getBrandContext(
    supabase,
    userId
  );

  if (!brandContext) {
    throw new Error(
      'Could not load brand profile — cannot generate aligned content without it.'
    );
  }

  const contextBlock =
    formatBrandContextForPrompt(brandContext);

  const instructions = typeInstructions[contentType];

  if (!instructions) {
    throw new Error(
      `Unsupported LOVIZA content type: ${contentType}`
    );
  }

  const prompt = `
You are LOVIZA AI, an expert brand-content generation engine.

IMPORTANT BRAND SAFETY RULES:
- Use the provided brand information as the source of truth.
- Do not invent company facts.
- Do not invent customers.
- Do not invent awards.
- Do not invent revenue.
- Do not invent statistics.
- Do not invent testimonials.
- Do not invent product capabilities that are not supported by the brand information.
- If information is unavailable, write generically rather than inventing facts.

BRAND CONTEXT:
${contextBlock}

CONTENT TYPE:
${contentType}

TASK:
${instructions}

${
  topic
    ? `SPECIFIC TOPIC:
${topic}`
    : `TOPIC:
Choose the topic that best showcases the brand's
real value proposition or addresses a relevant
customer pain point.`
}

CONTENT QUALITY REQUIREMENTS:
- Original content.
- Clear and natural language.
- Human-sounding.
- Avoid generic AI filler.
- Avoid excessive emojis.
- Avoid repetitive phrases.
- Make the content useful to the intended audience.
- Keep the brand positioning consistent.

RETURN ONLY VALID JSON.

Do NOT use markdown.
Do NOT use code fences.
Do NOT add explanations outside JSON.

Return exactly this structure:

{
  "title": "...",
  "body": "...",
  "caption": "...",
  "hashtags": "...",
  "imagePrompt": "...",
  "videoPrompt": "...",
  "slides": [],
  "emailSubject": "...",
  "emailPreviewText": "...",
  "adHeadline": "...",
  "adPrimaryText": "...",
  "adCallToAction": "...",
  "contentType": "${contentType}"
}

FIELD RULES:

title:
Main content title.

body:
Main written content or video script.

caption:
Social media caption.

hashtags:
Hashtags separated by spaces.

imagePrompt:
Only meaningfully populate this for:
- infographic
- instagram_post
- carousel
- ad_image

For other content types use an empty string.

videoPrompt:
Only meaningfully populate this for:
- video
- instagram_reel
- youtube_short
- product_video

For other content types use an empty string.

slides:
Only populate for carousel.

For carousel use:

[
  {
    "slideNumber": 1,
    "title": "...",
    "text": "...",
    "visualPrompt": "..."
  }
]

For non-carousel content return [].

emailSubject:
Only populate for email.

emailPreviewText:
Only populate for email.

adHeadline:
Only populate for ad_image.

adPrimaryText:
Only populate for ad_image.

adCallToAction:
Only populate for ad_image.

contentType:
Must be exactly:
"${contentType}"
`.trim();

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
  });

  const result = await model.generateContent(prompt);

  const rawText = result.response
    .text()
    .trim();

  /**
   * Gemini sometimes returns JSON inside markdown fences.
   * Remove them defensively.
   */
  const cleaned = rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  let parsed: GeneratedContent;

  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    console.error(
      'Failed to parse Gemini response as JSON:',
      cleaned
    );

    throw new Error(
      'Content generation returned malformed output. Try again.'
    );
  }

  /**
   * Defensive defaults.
   * This prevents undefined values from breaking existing UI.
   */
  return {
    title:
      typeof parsed.title === 'string'
        ? parsed.title
        : '',

    body:
      typeof parsed.body === 'string'
        ? parsed.body
        : '',

    caption:
      typeof parsed.caption === 'string'
        ? parsed.caption
        : '',

    hashtags:
      typeof parsed.hashtags === 'string'
        ? parsed.hashtags
        : '',

    imagePrompt:
      typeof parsed.imagePrompt === 'string'
        ? parsed.imagePrompt
        : '',

    videoPrompt:
      typeof parsed.videoPrompt === 'string'
        ? parsed.videoPrompt
        : '',

    slides:
      Array.isArray(parsed.slides)
        ? parsed.slides
        : [],

    emailSubject:
      typeof parsed.emailSubject === 'string'
        ? parsed.emailSubject
        : '',

    emailPreviewText:
      typeof parsed.emailPreviewText === 'string'
        ? parsed.emailPreviewText
        : '',

    adHeadline:
      typeof parsed.adHeadline === 'string'
        ? parsed.adHeadline
        : '',

    adPrimaryText:
      typeof parsed.adPrimaryText === 'string'
        ? parsed.adPrimaryText
        : '',

    adCallToAction:
      typeof parsed.adCallToAction === 'string'
        ? parsed.adCallToAction
        : '',

    contentType,
  };
}