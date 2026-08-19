import { createClient } from '@supabase/supabase-js';

export interface BrandContext {
  businessName: string;
  website: string;
  description: string;
  productsServices: string;
  icp: string; // ideal customer profile
  propositions: string; // value propositions
  tone: string;
  keywords: string;
}

export async function getBrandContext(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<BrandContext | null> {
  const { data, error } = await supabase
    .from('brand_profiles')
    .select('business_name, website, description, products_services, icp, propositions, tone, keywords')
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    console.error('Failed to fetch brand profile:', error);
    return null;
  }

  return {
    businessName: data.business_name,
    website: data.website,
    description: data.description,
    productsServices: data.products_services,
    icp: data.icp,
    propositions: data.propositions,
    tone: data.tone,
    keywords: data.keywords,
  };
}

export function formatBrandContextForPrompt(ctx: BrandContext): string {
  return `
BRAND PROFILE (use this to ground every claim, tone choice, and topic — never write generic content that could apply to any business):

Business name: ${ctx.businessName}
Website: ${ctx.website}
What they do: ${ctx.description}
Products/services: ${ctx.productsServices}
Ideal customer profile: ${ctx.icp}
Core value propositions: ${ctx.propositions}
Brand tone/voice: ${ctx.tone}
Target keywords: ${ctx.keywords}

RULES:
- Every post must reference at least one concrete detail from "What they do", "Products/services", or "Core value propositions" — not generic industry talk.
- Write in the specified brand tone, not a default neutral marketing voice.
- Speak to the ideal customer profile specifically, addressing their likely pain points or interests.
- Naturally work in 1-2 target keywords where it doesn't feel forced.
- Do not invent facts, statistics, or claims about the business that aren't implied by the profile above.
`.trim();
}