import { llm } from "./ai.server";

export interface CarouselSlide {
  slide_number: number;
  headline: string;
  body: string;
  image_prompt: string;
}

export interface CarouselContent {
  title: string;
  caption: string;
  hashtags: string[];
  slides: CarouselSlide[];
}

export async function generateCarousel(params: {
  brandName: string;
  productOrService: string;
  targetAudience: string;
  topic: string;
  numberOfSlides?: number;
}): Promise<CarouselContent> {
  const numberOfSlides = params.numberOfSlides ?? 7;

  const prompt = `
Create a high-quality social-media carousel.

BRAND:
${params.brandName}

PRODUCT/SERVICE:
${params.productOrService}

TARGET AUDIENCE:
${params.targetAudience}

TOPIC:
${params.topic}

Create exactly ${numberOfSlides} slides.

Return ONLY valid JSON:

{
  "title": "...",
  "caption": "...",
  "hashtags": ["...", "..."],
  "slides": [
    {
      "slide_number": 1,
      "headline": "...",
      "body": "...",
      "image_prompt": "..."
    }
  ]
}

Rules:

- Slide 1 must be a strong hook.
- Middle slides must teach/explain.
- Final slide must contain a CTA.
- Keep headlines short.
- Keep slide body concise.
- Image prompts must describe professional marketing visuals.
- Do not use markdown.
`;

  const response = await llm.invoke(prompt);

  const text = response.content.toString();

  return JSON.parse(cleanJson(text));
}

function cleanJson(text: string): string {
  return text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
}