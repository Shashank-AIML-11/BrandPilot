/** Shared (browser + server) referral helpers. */

/** Discount given by every paid user's personal link. */
export const USER_REFERRAL_PERCENT = 20;
/** Root-created links can use any whole percent from 1 to this. */
export const MAX_REFERRAL_PERCENT = 99;
/** Where the browser remembers a referral code between visiting the link and paying. */
export const REF_STORAGE_KEY = "loviza_ref";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
export const CODE_LENGTH = 8;

export function normalizeReferralCode(raw: string | null | undefined): string {
  return (raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 32);
}

export function codeAlphabet(): string {
  return CODE_ALPHABET;
}

/** Price after a percentage discount, in paise (whole numbers only). */
export function discountedPaise(listPaise: number, percent: number): number {
  const off = Math.round((listPaise * percent) / 100);
  return Math.max(100, listPaise - off); // Razorpay's minimum charge is 1 rupee
}

/** The shareable link. `origin` is e.g. window.location.origin. */
export function referralLink(origin: string, code: string): string {
  return `${origin.replace(/\/$/, "")}/pricing?ref=${encodeURIComponent(code)}`;
}

export function shareMessage(percent: number, link: string): string {
  return `I use LOVIZA to run my brand's marketing on autopilot. Use my link to get ${percent}% off your first plan: ${link}`;
}

/** Rupees from paise, showing paise only when there are some (e.g. ₹19,999.20). */
export function formatRupeesFromPaise(paise: number): string {
  const rupees = paise / 100;
  const whole = Number.isInteger(rupees);
  return `₹${new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(rupees)}`;
}

/**
 * Accepts what people actually paste: the full link
 * ("https://app.loviza.click/pricing?ref=K7M2QX9A"), "ref=K7M2QX9A", or just the code.
 */
export function extractReferralCode(input: string | null | undefined): string {
  const text = (input ?? "").trim();
  if (!text) return "";
  try {
    const fromUrl = new URL(text).searchParams.get("ref");
    if (fromUrl) return normalizeReferralCode(fromUrl);
  } catch {
    // Not a URL; fall through.
  }
  const match = /[?&]?ref=([A-Za-z0-9]+)/i.exec(text);
  return normalizeReferralCode(match ? match[1] : text);
}
