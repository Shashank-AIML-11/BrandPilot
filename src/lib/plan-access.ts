/**
 * Pure date rules for prepaid 30-day plans. No imports, so it runs on the
 * server, in the browser and in tests. "Days left" is counted in Indian
 * calendar days (IST), because that is how customers read dates.
 */

export const PERIOD_DAYS = 30;
/** Reminder emails go out on each of the last 5 days before expiry. */
export const REMINDER_DAYS = 5;
/** Old autopay rows get this long for Razorpay's charge webhook to extend them. */
export const LEGACY_AUTOPAY_GRACE_DAYS = 3;

const DAY_MS = 86_400_000;
const IST_OFFSET_MS = 330 * 60_000;

/** IST calendar day number (days since 1970-01-01 in IST). */
function istDayNumber(d: Date): number {
  return Math.floor((d.getTime() + IST_OFFSET_MS) / DAY_MS);
}

/**
 * Whole IST calendar days from today to the expiry day. 5 means "expires on
 * the date 5 days from today", 0 means it expires today, negative means gone.
 */
export function daysUntilExpiry(periodEnd: Date | string, now: Date = new Date()): number {
  return istDayNumber(new Date(periodEnd)) - istDayNumber(now);
}

/**
 * Is this period still paid for? Rows with no end date (legacy rows that the
 * migration has not touched) count as active, so nobody is locked out by a
 * missing value. `graceDays` is only used for old autopay rows.
 */
export function isPeriodActive(
  periodEnd: Date | string | null | undefined,
  now: Date = new Date(),
  graceDays = 0,
): boolean {
  if (!periodEnd) return true;
  return new Date(periodEnd).getTime() + graceDays * DAY_MS > now.getTime();
}

/**
 * New expiry after a renewal payment: 30 days on top of the current expiry if
 * it is still in the future, otherwise 30 days from now. Mirrors
 * public.apply_plan_payment() in the database.
 */
export function nextPeriodEnd(
  currentEnd: Date | string | null | undefined,
  now: Date = new Date(),
  periodDays: number = PERIOD_DAYS,
): Date {
  const end = currentEnd ? new Date(currentEnd) : null;
  const base = end && end.getTime() > now.getTime() ? end : now;
  return new Date(base.getTime() + periodDays * DAY_MS);
}

const dateFmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  year: "numeric",
});
const timeFmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/** e.g. "5 Dec 2026" */
export function formatIstDate(d: Date | string): string {
  return dateFmt.format(new Date(d));
}

/** e.g. "5 Dec 2026, 6:30 pm IST" */
export function formatIstDateTime(d: Date | string): string {
  const date = new Date(d);
  return `${dateFmt.format(date)}, ${timeFmt.format(date).toLowerCase()} IST`;
}
