import { generateImage } from "./ai.server";
import type { CarouselSlide } from "./carousel.server";

export async function generateCarouselImages(
  slides: CarouselSlide[]
) {
  const results = [];

  for (const slide of slides) {
    const image = await generateImage({
      prompt: `
Create a premium social media carousel image.

Headline:
${slide.headline}

Content:
${slide.body}

Visual direction:
${slide.image_prompt}

Style:
Modern
Professional
Premium
High contrast
Clean composition
Social-media optimized

Do NOT generate long paragraphs of text inside the image.
      `,
    });

    results.push({
      slide_number: slide.slide_number,
      image_url: image,
    });
  }

  return results;
}