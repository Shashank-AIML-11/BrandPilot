/** Shared (browser + server) affiliate-program helpers. No secrets, no server imports. */

/** Share of every plan payment a referred customer makes that the affiliate earns. */
export const AFFILIATE_COMMISSION_PERCENT = 20;
/** Days a commission is held before it can be withdrawn (the refund window). */
export const AFFILIATE_HOLD_DAYS = 30;
/** Smallest balance that can be withdrawn: INR 1,000, in paise. */
export const AFFILIATE_MIN_PAYOUT_PAISE = 100_000;

export type CommissionStatus = "approved" | "requested" | "paid" | "void";
export type PayoutStatus = "requested" | "paid" | "rejected";
export type PayoutMethod = "upi" | "bank";

/** Commission on a payment, in whole paise, rounded down (matches the database function). */
export function commissionPaise(
  paidPaise: number,
  percent: number = AFFILIATE_COMMISSION_PERCENT,
): number {
  return Math.floor((paidPaise * percent) / 100);
}

export const UPI_ID_PATTERN = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}$/;
export const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export const BANK_ACCOUNT_PATTERN = /^\d{9,18}$/;

export function normalizeIfsc(raw: string): string {
  return raw.trim().toUpperCase();
}

/** "XXXXXX1234": shows only the last 4 digits of a bank account number. */
export function maskAccountNumber(account: string | null | undefined): string {
  const a = (account ?? "").trim();
  if (a.length <= 4) return a;
  return `${"X".repeat(Math.min(a.length - 4, 8))}${a.slice(-4)}`;
}

/** Rupees from paise, e.g. 123456 -> "₹1,234.56"; whole rupees show no decimals. */
export function formatPaise(paise: number): string {
  const rupees = paise / 100;
  const whole = Number.isInteger(rupees);
  return `₹${new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(rupees)}`;
}

/** What an affiliate sees for each of their commissions. */
export function commissionLabel(status: CommissionStatus, availableAt: string, now = Date.now()) {
  if (status === "approved") {
    return Date.parse(availableAt) > now ? "On hold" : "Available";
  }
  if (status === "requested") return "Payout requested";
  if (status === "paid") return "Paid";
  return "Cancelled";
}
