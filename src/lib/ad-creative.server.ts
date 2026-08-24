import { llm } from "./ai.server";

export interface AdCreative {
  platform: string;
  headline: string;
  primary_text: string;
  description: string;
  cta: string;
  image_prompt: string;
  hashtags: string[];
}

export async function generateAdCreative(params: {
  brandName: string;
  productOrService: string;
  targetAudience: string;
  platform: "facebook" | "instagram" | "linkedin" | "google";
  objective: string;
  offer?: string;
}): Promise<AdCreative> {

  const prompt = `
Create a professional advertising creative.

BRAND:
${params.brandName}

PRODUCT/SERVICE:
${params.productOrService}

TARGET AUDIENCE:
${params.targetAudience}

PLATFORM:
${params.platform}

CAMPAIGN OBJECTIVE:
${params.objective}

OFFER:
${params.offer || "None"}

Return ONLY valid JSON:

{
  "platform": "...",
  "headline": "...",
  "primary_text": "...",
  "description": "...",
  "cta": "...",
  "image_prompt": "...",
  "hashtags": []
}

Rules:

- Make the headline attention grabbing.
- Clearly communicate the product/service benefit.
- Use one strong CTA.
- Don't invent statistics.
- Don't invent discounts.
- Don't invent guarantees.
- Image prompt should describe the actual product/service visually.
`;

  const response = await llm.invoke(prompt);

  return JSON.parse(
    response.content
      .toString()
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim()
  );
}