/**
 * Autopost (the header switch).
 *
 * ON means: manual review is off and generated content is posted automatically
 * (the daily "post" task at 7 AM IST). It is ON only after the user has pressed
 * "Accept" on the notice, which is what saves profiles.autopost_enabled = true.
 * A missing or null value is OFF, the same rule the publishing queue applies.
 */
export function isAutopostOn(me: { profile?: unknown } | null | undefined): boolean {
  const profile = me?.profile as { autopost_enabled?: boolean | null } | null | undefined;
  return profile?.autopost_enabled === true;
}

export const AUTOPOST_CONSENT_TEXT =
  "Manual review is turned off. Generated Content will be posted Automatically without manual review.";

export const AUTOPOST_SCHEDULE_NOTE =
  "All generated Content will be posted Automatically at 7 AM daily.";
