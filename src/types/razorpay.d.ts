export interface RazorpayCheckoutOptions {
  key: string;
  /** Prepaid 30-day plans: a one-time Order. */
  order_id?: string;
  amount?: number;
  currency?: string;
  /** Legacy autopay subscriptions (no longer created by the app). */
  subscription_id?: string;
  name: string;
  description?: string;
  image?: string;
  prefill?: { name?: string | undefined; email?: string | undefined };
  theme?: { color?: string };
  handler: (response: {
    razorpay_payment_id: string;
    razorpay_order_id?: string;
    razorpay_subscription_id?: string;
    razorpay_signature: string;
  }) => void;
  modal?: { ondismiss?: () => void };
}

export interface RazorpayCheckoutInstance {
  open: () => void;
  on: (event: string, handler: (response: unknown) => void) => void;
}

declare global {
  interface Window {
    Razorpay: new (options: RazorpayCheckoutOptions) => RazorpayCheckoutInstance;
  }
}
