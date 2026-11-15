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
  priceMonthly: number; // INR, whole rupees, for one month paid monthly
  /** INR per month when the customer pays for the whole year up front (40% below priceMonthly). */
  priceAnnualPerMonth: number;
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
    priceMonthly: 2499,
    priceAnnualPerMonth: 1499,
    tagline: "For solo founders testing the water.",
    features: [
      "1 brand profile",
      "44 pieces of content per month",
      "Blog, posts, reels, video posts, shorts, carousels",
      "1 Reel, Short, TikTok & product video per month",
      "2 social channels",
      "Performance analytics",
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
    priceMonthly: 4165,
    priceAnnualPerMonth: 2499,
    tagline: "Auto-posting across every channel.",
    highlight: true,
    features: [
      "2 brand profiles",
      "44 pieces of content per month",
      "Blog, posts, reels, video posts, shorts, carousels",
      "Auto-schedule & auto-posting",
      "5 social channels",
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
    priceMonthly: 41665,
    priceAnnualPerMonth: 24999,
    tagline: "Agencies running many brands at once.",
    features: [
      "20 brand profiles",
      "44 pieces of content per month",
      "Blog, posts, reels, video posts, shorts, carousels",
      "Auto-schedule & auto-posting",
      "11 social channels",
      "Google Drive sync",
      "Advanced performance analytics",
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

export type BillingCycle = "monthly" | "annual";

/** Shown on the Annual option. 2,499 -> 1,499 per month is 40% off. */
export const ANNUAL_DISCOUNT_PERCENT = 40;
export const MONTHLY_PERIOD_DAYS = 30;
export const ANNUAL_PERIOD_DAYS = 365;

export function parseBillingCycle(value: unknown): BillingCycle {
  return value === "annual" ? "annual" : "monthly";
}

export function periodDaysFor(cycle: BillingCycle): number {
  return cycle === "annual" ? ANNUAL_PERIOD_DAYS : MONTHLY_PERIOD_DAYS;
}

/** What the customer pays in one go, in whole rupees (annual = 12 months paid up front). */
export function planTotalInr(plan: Plan, cycle: BillingCycle): number {
  return cycle === "annual" ? plan.priceAnnualPerMonth * 12 : plan.priceMonthly;
}

/** The per-month figure to show on a card for this cycle. */
export function planPerMonthInr(plan: Plan, cycle: BillingCycle): number {
  return cycle === "annual" ? plan.priceAnnualPerMonth : plan.priceMonthly;
}

/** What the customer saves over a year by paying annually, in whole rupees. */
export function annualSavingInr(plan: Plan): number {
  return plan.priceMonthly * 12 - plan.priceAnnualPerMonth * 12;
}

export function planById(id: string | null | undefined): Plan | undefined {
  return PLANS.find((p) => p.id === id);
}
