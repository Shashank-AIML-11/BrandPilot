import { GoogleGenerativeAI } from '@google/generative-ai';
import { getBrandContext, formatBrandContextForPrompt } from './buildBrandContext';
import { createClient } from '@supabase/supabase-js';

const genAI = new GoogleGenerativeAI(process.env.LOVIZA_GEMINI_API_KEY!);

interface GenerateContentParams {
  supabase: ReturnType<typeof createClient>;
  userId: string;
  contentType: 'blog' | 'infographic' | 'video';
  topic?: string; // optional override; otherwise the model picks based on brand context
}

interface GeneratedContent {
  title: string;
  body: string;
  caption: string;
  hashtags: string;
  imagePrompt?: string; // for infographic rendering
}

export async function generateContent({
  supabase,
  userId,
  contentType,
  topic,
}: GenerateContentParams): Promise<GeneratedContent> {
  const brandContext = await getBrandContext(supabase, userId);

  if (!brandContext) {
    throw new Error('Could not load brand profile — cannot generate aligned content without it.');
  }

  const contextBlock = formatBrandContextForPrompt(brandContext);

  const typeInstructions: Record<string, string> = {
    blog: 'Write a short-form social/blog post (150-250 words). Include a hook first line, 2-3 body sentences grounded in the brand profile, and a soft call-to-action.',
    infographic: 'Write content for a visual infographic: a punchy title (under 8 words), 3-4 short supporting points (each under 12 words, suitable for on-image text), and a one-line caption for the social post accompanying the image.',
    video: 'Write a short video script (30-45 seconds spoken): a hook line, 2-3 sentences of value-driven content grounded in the brand profile, and a closing call-to-action.',
  };

  const prompt = `
${contextBlock}

TASK: ${typeInstructions[contentType]}
${topic ? `Specific topic to cover: ${topic}` : 'Choose a topic that best showcases this brand\'s value propositions or addresses a pain point of their ideal customer.'}

Respond ONLY with valid JSON, no markdown formatting, no backticks, in this exact shape:
{
  "title": "...",
  "body": "...",
  "caption": "...",
  "hashtags": "...",
  "imagePrompt": "..." 
}
imagePrompt should only be meaningfully filled if contentType is "infographic" or "video" (describe the visual). Otherwise leave it as an empty string.
`.trim();

  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  const result = await model.generateContent(prompt);
  const rawText = result.response.text().trim();

  // Defensive parsing in case the model wraps output in markdown fences despite instructions
  const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();

  let parsed: GeneratedContent;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    console.error('Failed to parse Gemini response as JSON:', cleaned);
    throw new Error('Content generation returned malformed output. Try again.');
  }

  return parsed;
}