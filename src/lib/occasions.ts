/**
 * Real-world occasion calendar (India first, plus global retail moments) so the brain only uses a
 * festival or season when it is actually close to the piece's date. Lunar festival dates are the
 * published 2026 and 2027 dates (2027 ones can shift by a day); fixed-date days repeat every year.
 * Extend LUNAR when the next year's panchang is published.
 */
export interface Occasion {
  name: string;
  date: string; // YYYY-MM-DD
  /** how far ahead of the date it is worth posting (days) */
  lead: number;
  /** short hint for the writer */
  hint: string;
}

const L = (name: string, date: string, lead: number, hint: string): Occasion => ({ name, date, lead, hint });

const LUNAR: Occasion[] = [
  // 2026
  L("Makar Sankranti / Pongal", "2026-01-14", 10, "harvest, kites, sweets, gifting"),
  L("Vasant Panchami", "2026-01-23", 7, "yellow, learning, spring"),
  L("Maha Shivaratri", "2026-02-15", 7, "devotion, puja items"),
  L("Holi", "2026-03-03", 14, "colour, family, sweets, gifting"),
  L("Ugadi / Gudi Padwa", "2026-03-19", 10, "new year, new beginnings, home"),
  L("Eid al-Fitr", "2026-03-20", 14, "gifting, family, new clothes, home"),
  L("Ram Navami", "2026-03-26", 7, "devotion, puja"),
  L("Akshaya Tritiya", "2026-04-19", 14, "auspicious buying, gold and metal, gifting"),
  L("Eid al-Adha", "2026-05-27", 10, "family, gifting"),
  L("Onam", "2026-08-26", 10, "Kerala, flowers, lamps, home"),
  L("Raksha Bandhan", "2026-08-28", 14, "sibling gifts, rakhi, gifting"),
  L("Janmashtami", "2026-09-04", 10, "devotion, puja, decor"),
  L("Ganesh Chaturthi", "2026-09-14", 14, "idols, puja, decor, gifting"),
  L("Navratri", "2026-10-11", 10, "nine nights, puja, diyas, decor"),
  L("Dussehra", "2026-10-20", 7, "victory, family"),
  L("Karwa Chauth", "2026-10-28", 10, "gifts for wives, puja items"),
  L("Dhanteras", "2026-11-06", 14, "auspicious buying, metal, utensils, gold"),
  L("Diwali", "2026-11-08", 28, "lights, diyas, gifting, home decor, new buys"),
  L("Bhai Dooj", "2026-11-11", 7, "sibling gifts"),
  // 2027
  L("Makar Sankranti / Pongal", "2027-01-14", 10, "harvest, kites, sweets, gifting"),
  L("Maha Shivaratri", "2027-03-06", 7, "devotion, puja items"),
  L("Eid al-Fitr", "2027-03-10", 14, "gifting, family, new clothes, home"),
  L("Holi", "2027-03-22", 14, "colour, family, sweets, gifting"),
  L("Ugadi / Gudi Padwa", "2027-04-08", 10, "new year, new beginnings, home"),
  L("Ram Navami", "2027-04-15", 7, "devotion, puja"),
  L("Akshaya Tritiya", "2027-05-09", 14, "auspicious buying, gold and metal, gifting"),
  L("Eid al-Adha", "2027-05-16", 10, "family, gifting"),
  L("Raksha Bandhan", "2027-08-17", 14, "sibling gifts, rakhi, gifting"),
  L("Janmashtami", "2027-08-25", 10, "devotion, puja, decor"),
  L("Ganesh Chaturthi", "2027-09-04", 14, "idols, puja, decor, gifting"),
  L("Navratri", "2027-10-01", 10, "nine nights, puja, diyas, decor"),
  L("Dussehra", "2027-10-09", 7, "victory, family"),
  L("Karwa Chauth", "2027-10-18", 10, "gifts for wives, puja items"),
  L("Dhanteras", "2027-10-27", 14, "auspicious buying, metal, utensils, gold"),
  L("Diwali", "2027-10-29", 28, "lights, diyas, gifting, home decor, new buys"),
  L("Bhai Dooj", "2027-10-31", 7, "sibling gifts"),
];

/** nth weekday (0=Sun) of a month, e.g. 4th Thursday of November. */
function nthWeekday(year: number, month: number, weekday: number, n: number): string {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const day = 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function fixed(year: number): Occasion[] {
  const y = String(year);
  return [
    L("New Year", `${y}-01-01`, 10, "fresh start, resolutions, new year offers"),
    L("Republic Day", `${y}-01-26`, 7, "national pride, sale"),
    L("Valentine's Day", `${y}-02-14`, 14, "gifting, couples"),
    L("Women's Day", `${y}-03-08`, 7, "women, appreciation"),
    L("Mother's Day", nthWeekday(year, 5, 0, 2), 10, "gifts for mothers"),
    L("Father's Day", nthWeekday(year, 6, 0, 3), 10, "gifts for fathers"),
    L("Independence Day", `${y}-08-15`, 7, "national pride, sale"),
    L("Friendship Day", nthWeekday(year, 8, 0, 1), 7, "friends, gifting"),
    L("Teachers' Day", `${y}-09-05`, 5, "teachers, appreciation"),
    L("Gandhi Jayanti", `${y}-10-02`, 3, "simplicity, handmade, local"),
    L("Children's Day", `${y}-11-14`, 7, "kids, gifting"),
    L("Black Friday", addDays(nthWeekday(year, 11, 4, 4), 1), 10, "big discounts, online sales"),
    L("Christmas", `${y}-12-25`, 21, "gifting, home decor, parties, winter"),
    L("New Year's Eve", `${y}-12-31`, 7, "year-end, parties, year-end sale"),
  ];
}

function addDays(d: string, n: number): string {
  const t = new Date(`${d}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

const daysBetween = (from: string, to: string) =>
  Math.round((new Date(`${to}T12:00:00Z`).getTime() - new Date(`${from}T12:00:00Z`).getTime()) / 86_400_000);

/** Occasions that are close to `date`: upcoming within their lead time, or ended in the last 2 days. */
export function occasionsNear(date: string): Array<Occasion & { daysAway: number }> {
  const year = Number(date.slice(0, 4));
  const all = [...LUNAR, ...fixed(year - 1), ...fixed(year), ...fixed(year + 1)];
  return all
    .map((o) => ({ ...o, daysAway: daysBetween(date, o.date) }))
    .filter((o) => o.daysAway <= o.lead && o.daysAway >= -2)
    .sort((a, b) => a.daysAway - b.daysAway);
}

/** One line for the writer and the director: what is genuinely close to this date, or an explicit "none". */
export function occasionLine(date: string): string {
  const near = occasionsNear(date).slice(0, 3);
  if (!near.length) return "no festival or occasion is close to this date, so do not mention any festival or season-specific event";
  return near
    .map((o) => `${o.name} (${o.date.slice(5)}, ${o.daysAway > 0 ? `in ${o.daysAway} days` : o.daysAway === 0 ? "that day" : "just passed"}; ${o.hint})`)
    .join("; ");
}
