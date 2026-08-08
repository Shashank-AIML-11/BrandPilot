export type PlanId = "starter" | "growth" | "scale";

export interface Plan {
  id: PlanId;
  name: string;
  priceMonthly: number;
  tagline: string;
  highlight?: boolean;
  features: string[];
}

export const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    priceMonthly: 29,
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
    priceMonthly: 89,
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
    priceMonthly: 249,
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

export const PAYMENT_METHODS = [
  { id: "card", label: "Credit / Debit card", hint: "Visa, Mastercard, Amex, RuPay" },
  { id: "upi", label: "UPI", hint: "GPay, PhonePe, Paytm, BHIM" },
  { id: "netbanking", label: "Net banking", hint: "All major Indian banks" },
  { id: "wallet", label: "Wallet", hint: "Paytm, Amazon Pay, Mobikwik" },
  { id: "paypal", label: "PayPal", hint: "International payments" },
  { id: "applepay", label: "Apple Pay / Google Pay", hint: "One-tap checkout" },
  { id: "bank", label: "Bank transfer / Invoice", hint: "For annual enterprise billing" },
];

export function planById(id: string | null | undefined): Plan | undefined {
  return PLANS.find((p) => p.id === id);
}
