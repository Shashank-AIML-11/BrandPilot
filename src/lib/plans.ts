export type PlanId = "starter" | "growth" | "scale";

/**
 * One monthly allowance per content type. Kept as a plain literal type
 * (not imported from content.server.ts) because plans.ts is imported
 * directly by client components (checkout.tsx, pricing.tsx) — importing
 * a .server.ts file from here would leak server-only code into the
 * client bundle. Keep this list in sync with CONTENT_TYPES in
 * content.server.ts by hand.
 */
export interface PlanMonthlyContent {
  linkedin_post: number;
  instagram_post: number;
  instagram_reel: number;
  facebook_post: number;
  youtube_short: number;
  twitter_post: number;
  carousel: number;
  blog: number;
  product_service_video: number;
  tiktok_video: number;
  pinterest: number;
}

export interface Plan {
  id: PlanId;
  name: string;
  priceMonthly: number; // INR, whole rupees - must match the amount on the corresponding Razorpay Plan (RAZORPAY_PLAN_STARTER / _GROWTH / _SCALE)
  tagline: string;
  highlight?: boolean;
  features: string[];
  monthlyContent: PlanMonthlyContent;
  brandProfileLimit: number;
  channelLimit: number | null; // null = all channels
  autoPost: boolean;
  analytics: "none" | "basic" | "advanced";
  support: "email" | "priority" | "dedicated";
}

/** Formats a whole-rupee amount as e.g. "Rs 2,499" (Indian digit grouping, no decimals). Uses a \u20B9 escape sequence rather than a literal rupee character so it can't be silently corrupted by a non-UTF-8 file save (e.g. Notepad's ANSI default). */
export function formatINR(amount: number): string {
  return `\u20B9${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(amount)}`;
}

export const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    priceMonthly: 1499,
    tagline: "For solo founders testing the water.",
    features: [
      "1 brand profile",
      "23 pieces of content per month",
      "Blog, LinkedIn, Instagram, Facebook, X, Pinterest, carousels",
      "1 Reel, Short, TikTok & product video per month",
      "2 social channels",
      "Email support",
    ],
    monthlyContent: {
      blog: 4,
      linkedin_post: 4,
      instagram_post: 4,
      facebook_post: 2,
      twitter_post: 2,
      pinterest: 2,
      carousel: 1,
      instagram_reel: 1,
      youtube_short: 1,
      tiktok_video: 1,
      product_service_video: 1,
    },
    brandProfileLimit: 1,
    channelLimit: 2,
    autoPost: false,
    analytics: "none",
    support: "email",
  },
  {
    id: "growth",
    name: "Growth",
    priceMonthly: 2499,
    tagline: "Auto-posting across every channel.",
    highlight: true,
    features: [
      "2 brand profiles",
      "36 pieces of content per month",
      "Blog, LinkedIn, Instagram, Facebook, X, Pinterest, carousels",
      "2 Reels, Shorts, TikToks & product videos per month",
      "Auto-schedule & auto-posting",
      "All social channels",
      "Google Drive sync",
      "Performance analytics",
      "Priority support",
    ],
    monthlyContent: {
      blog: 4,
      linkedin_post: 4,
      instagram_post: 4,
      facebook_post: 4,
      twitter_post: 4,
      pinterest: 4,
      carousel: 2,
      instagram_reel: 2,
      youtube_short: 2,
      tiktok_video: 2,
      product_service_video: 2,
    },
    brandProfileLimit: 2,
    channelLimit: null,
    autoPost: true,
    analytics: "basic",
    support: "priority",
  },
  {
    id: "scale",
    name: "Scale",
    priceMonthly: 24999,
    tagline: "Agencies running many brands at once.",
    features: [
      "20 brand profiles",
      "36 pieces of content per brand, per month",
      "Blog, LinkedIn, Instagram, Facebook, X, Pinterest, carousels",
      "2 Reels, Shorts, TikToks & product videos per brand",
      "Auto-schedule & auto-posting",
      "All social channels",
      "Google Drive sync",
      "Advanced analytics",
      "Dedicated support manager",
    ],
    // Per-brand quota - see the multi-brand-profile note below before this is
    // actually enforced per brand rather than per user.
    monthlyContent: {
      blog: 4,
      linkedin_post: 4,
      instagram_post: 4,
      facebook_post: 4,
      twitter_post: 4,
      pinterest: 4,
      carousel: 2,
      instagram_reel: 2,
      youtube_short: 2,
      tiktok_video: 2,
      product_service_video: 2,
    },
    brandProfileLimit: 20,
    channelLimit: null,
    autoPost: true,
    analytics: "advanced",
    support: "dedicated",
  },
];

export function planById(id: string | null | undefined): Plan | undefined {
  return PLANS.find((p) => p.id === id);
}