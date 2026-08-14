export type PlanId = "starter" | "growth" | "scale";

export interface Plan {
  id: PlanId;
  name: string;
  priceMonthly: number;
  tagline: string;
  highlight?: boolean;
  features: string[];
}

/** Formats a whole-rupee amount as "₹2,499" (Indian digit grouping, no decimals). */
export function formatINR(amount: number): string {
  return `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(amount)}`;
}

export const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    priceMonthly: 2499,
    tagline: "For solo founders testing the water.",
    features: [
      "1 brand profile",
      "1 blog + 2 infographics daily",
      "Content calendar & manual posting",
      "2 social channels",
      "Email support",
    ],
  },
  {
    id: "growth",
    name: "Growth",
    priceMonthly: 7999,
    tagline: "The full daily engine for growing teams.",
    highlight: true,
    features: [
      "3 brand profiles",
      "1 blog + 4 infographics + 2 videos daily",
      "Auto-schedule & auto-post triggers",
      "All social channels + Google Drive sync",
      "Performance analytics",
      "Priority support",
    ],
  },
  {
    id: "scale",
    name: "Scale",
    priceMonthly: 24999,
    tagline: "Agencies running many brands at once.",
    features: [
      "Unlimited brand profiles",
      "Unlimited daily generation",
      "Role-based team access (viewer / editor / admin)",
      "Advanced analytics & exports",
      "Bulk month regeneration",
      "Dedicated success manager",
    ],
  },
];

export function planById(id: string | null | undefined): Plan | undefined {
  return PLANS.find((p) => p.id === id);
}
