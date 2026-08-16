export type PlanId = "starter" | "growth" | "scale";

export interface PlanMonthlyContent {
  blog: number;
  infographic: number;
  video: number;
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
    priceMonthly: 2499,
    tagline: "For solo founders testing the water.",
    features: [
      "1 brand profile",
      "4 blogs + 4 infographics per month",
      "4 videos per month",
      "2 social channels",
      "Email support",
    ],
    monthlyContent: { blog: 4, infographic: 4, video: 4 },
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
      "4 blogs + 4 infographics per month",
      "4 videos per month",
      "Auto-schedule & auto-posting",
      "All social channels",
      "Google Drive sync",
      "Performance analytics",
      "Priority support",
    ],
    monthlyContent: { blog: 4, infographic: 4, video: 4 },
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
      "4 blogs + 4 infographics per brand",
      "4 videos per brand",
      "Auto-schedule & auto-posting",
      "All social channels",
      "Google Drive sync",
      "Advanced analytics",
      "Dedicated support manager",
    ],
    // Per-brand quota - see the multi-brand-profile note below before this is
    // actually enforced per brand rather than per user.
    monthlyContent: { blog: 4, infographic: 4, video: 4 },
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