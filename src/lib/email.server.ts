import { llm } from "./ai.server";

export interface PersonalizedEmail {
  subject: string;
  preheader: string;
  greeting: string;
  body: string;
  cta_text: string;
  cta_url: string;
  signature: string;
}

export async function generatePersonalizedEmail(params: {
  brandName: string;
  productOrService: string;
  recipientName?: string;
  recipientCompany?: string;
  targetAudience: string;
  objective: string;
  offer?: string;
  ctaUrl?: string;
}): Promise<PersonalizedEmail> {

  const prompt = `
You are an expert B2B/B2C email marketing copywriter.

Create a personalized marketing email.

BRAND:
${params.brandName}

PRODUCT/SERVICE:
${params.productOrService}

RECIPIENT:
${params.recipientName || "Customer"}

RECIPIENT COMPANY:
${params.recipientCompany || ""}

TARGET AUDIENCE:
${params.targetAudience}

OBJECTIVE:
${params.objective}

OFFER:
${params.offer || "None"}

CTA URL:
${params.ctaUrl || ""}

Return ONLY valid JSON:

{
  "subject": "...",
  "preheader": "...",
  "greeting": "...",
  "body": "...",
  "cta_text": "...",
  "cta_url": "...",
  "signature": "..."
}

Rules:

- Personalize naturally.
- Do not fabricate personal information.
- Do not make false claims.
- Keep the email concise.
- Avoid spammy language.
- Include one clear CTA.
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