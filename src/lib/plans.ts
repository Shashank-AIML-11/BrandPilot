export type PlanId = "starter" | "growth" | "scale";

export interface PlanMonthlyContent {
  blog: number;
  infographic: number;
  video: number;
}

export interface Plan {
  id: PlanId;
  name: string;
  priceMonthly: number; // USD, display only — actual charge comes from the Razorpay Plan ID
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

export function formatUSD(amount: number): string {
  return `$${amount}`;
}

/** Kept for anywhere still formatting INR (e.g. old subscription records). */
export function formatINR(amount: number): string {
  return `?${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(amount)}`;
}

export const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    priceMonthly: 15,
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
    priceMonthly: 25,
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
    priceMonthly: 230,
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
    // Per-brand quota — see the multi-brand-profile note below before this is
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