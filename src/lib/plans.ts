export type PlanId = "starter" | "growth" | "scale";

/**
 * Monthly quota per content type. Keyed against ContentType from
 * content.server.ts (11 formats). Use Partial so a plan can omit a
 * type entirely (== 0) instead of listing every key.
 */
export type PlanMonthlyContent = Partial<{
  blog: number;
  linkedin_post: number;
  instagram_post: number;
  instagram_reel: number;
  facebook_post: number;
  youtube_short: number;
  twitter_post: number;
  carousel: number;
  product_service_video: number;
  tiktok_video: number;
  pinterest: number;
}>;

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

/*
 * PLACEHOLDER QUOTAS — these numbers are a guess to keep roughly the old
 * total monthly volume (was 4 blog + 4 infographic + 4 video = 12/mo).
 * instagram_reel / youtube_short / tiktok_video / product_service_video
 * are zeroed at generation time anyway (see content.functions.ts
 * VIDEO_TYPES_PAUSED) while video generation is paused, but the numbers
 * are still defined here so flipping that pause back on doesn't require
 * touching plans.ts again. Replace with real numbers before shipping.
 */
export const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    priceMonthly: 1499,
    tagline: "For solo founders testing the water.",
    features: [
      "1 brand profile",
      "4 blogs + 4 carousels per month",
      "8 social posts across LinkedIn, Instagram, X & Facebook",
      "4 video packages per month (paused during testing)",
      "2 social channels",
      "Email support",
    ],
    monthlyContent: {
      blog: 4,
      carousel: 4,
      linkedin_post: 2,
      instagram_post: 2,
      facebook_post: 2,
      twitter_post: 2,
      pinterest: 2,
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
      "4 blogs + 4 carousels per month",
      "Full social spread across every channel",
      "Auto-schedule & auto-posting",
      "All social channels",
      "Google Drive sync",
      "Performance analytics",
      "Priority support",
    ],
    monthlyContent: {
      blog: 4,
      carousel: 4,
      linkedin_post: 4,
      instagram_post: 4,
      facebook_post: 4,
      twitter_post: 4,
      pinterest: 4,
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
      "4 blogs + 4 carousels per brand",
      "Full social spread across every channel, per brand",
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
      carousel: 4,
      linkedin_post: 4,
      instagram_post: 4,
      facebook_post: 4,
      twitter_post: 4,
      pinterest: 4,
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