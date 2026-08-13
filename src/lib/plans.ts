export type PlanId = "starter" | "growth" | "scale";

export interface Plan {
  id: PlanId;
  name: string;
  priceMonthly: number;
  tagline: string;
  highlight?: boolean;
  features: string[];
  brandProfiles: number;
  monthlyContent: {
    blog: number;
    infographic: number;
    video: number;
  };
  channelLimit: number | null;
  autoPost: boolean;
}

export const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    priceMonthly: 14,
    tagline: "For a single brand getting started with consistent content.",
    features: [
      "1 brand profile",
      "2 blogs + 4 infographics + 3 videos per month",
      "Content calendar & manual posting",
      "2 social channels",
      "Email support",
    ],
    brandProfiles: 1,
    monthlyContent: { blog: 2, infographic: 4, video: 3 },
    channelLimit: 2,
    autoPost: false,
  },
  {
    id: "growth",
    name: "Growth",
    priceMonthly: 25,
    tagline: "For growing teams that need scheduling and performance insights.",
    highlight: true,
    features: [
      "2 brand profiles",
      "2 blogs + 4 infographics + 4 videos per month",
      "Auto-schedule & auto-posting",
      "All social channels + Google Drive sync",
      "Performance analytics",
      "Priority support",
    ],
    brandProfiles: 2,
    monthlyContent: { blog: 2, infographic: 4, video: 4 },
    channelLimit: null,
    autoPost: true,
  },
  {
    id: "scale",
    name: "Scale",
    priceMonthly: 230,
    tagline: "For agencies managing a portfolio of brands.",
    features: [
      "20 brand profiles",
      "2 blogs + 4 infographics + 5 videos per brand, per month",
      "Auto-schedule & auto-posting",
      "All social channels + Google Drive sync",
      "Advanced analytics",
      "Dedicated support manager",
    ],
    brandProfiles: 20,
    monthlyContent: { blog: 2, infographic: 4, video: 5 },
    channelLimit: null,
    autoPost: true,
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
