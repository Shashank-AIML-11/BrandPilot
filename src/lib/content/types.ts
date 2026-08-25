/**
 * Client-safe content-type data and pure helpers, shared by both server
 * code (content.server.ts) and client components (content-detail-dialog.tsx,
 * calendar.tsx, analytics.tsx, etc). Nothing here touches env vars, Supabase,
 * or any server-only API — that's the whole point: content.server.ts can't
 * be imported from the client, this file can.
 *
 * This is the single source of truth for the 11 formats. Adding a 12th
 * format means adding one entry to CONTENT_TYPES, one line to
 * CHANNELS_BY_TYPE, and (if it's an image or video type) one line to
 * IMAGE_TYPES/VIDEO_TYPES — everything else derives from those.
 */

export interface BrandRow {
  business_name: string;
  website: string;
  description: string;
  products_services: string;
  icp: string;
  propositions: string;
  tone: string;
  keywords: string;
  social_handles: Record<string, string> | null;
}

export const CONTENT_TYPES = [
  "linkedin_post",
  "instagram_post",
  "instagram_reel",
  "facebook_post",
  "youtube_short",
  "twitter_post",
  "carousel",
  "blog",
  "product_service_video",
  "tiktok_video",
  "pinterest",
] as const;

export type ContentType = (typeof CONTENT_TYPES)[number];

/** Formats rendered as an actual video file (mp4), vs a static image. */
export const VIDEO_TYPES: ContentType[] = [
  "instagram_reel",
  "youtube_short",
  "tiktok_video",
  "product_service_video",
];

/** Formats that render as a single static image. */
export const IMAGE_TYPES: ContentType[] = [
  "linkedin_post",
  "instagram_post",
  "facebook_post",
  "twitter_post",
  "pinterest",
];

export function isVideoType(type: string): boolean {
  return (VIDEO_TYPES as string[]).includes(type);
}

export function isImageType(type: string): boolean {
  return (IMAGE_TYPES as string[]).includes(type);
}

/** Human-readable label per type, e.g. for prompts or UI badges. */
export const TYPE_LABEL: Record<ContentType, string> = {
  blog: "blog post(s)",
  linkedin_post: "LinkedIn post(s)",
  instagram_post: "Instagram post(s)",
  instagram_reel: "Instagram Reel(s)",
  facebook_post: "Facebook post(s)",
  twitter_post: "X/Twitter post(s)",
  pinterest: "Pinterest pin(s)",
  youtube_short: "YouTube Short(s)",
  tiktok_video: "TikTok video(s)",
  product_service_video: "product/service video(s)",
  carousel: "carousel(s)",
};

export interface CarouselSlide {
  headline?: string;
  subtext?: string;
  image_prompt?: string;
}

export interface GeneratedPiece {
  title?: string;
  summary?: string;
  body?: string;
  caption?: string;
  hashtags?: string;
  image_prompt?: string;
  script?: string;
  time?: string;
  slides?: CarouselSlide[];
}

/** One AI response day: every format maps to a list of generated pieces. */
export type GeneratedDay = { date?: string } & Partial<Record<ContentType, GeneratedPiece[]>>;

export type DailyContentQuota = Record<ContentType, number>;

export function emptyQuota(): DailyContentQuota {
  return Object.fromEntries(CONTENT_TYPES.map((t) => [t, 0])) as DailyContentQuota;
}

/** Evenly distribute a plan's monthly allowance over the available dates. */
export function distributeMonthlyContent(
  dates: string[],
  totals: Partial<DailyContentQuota>,
): Record<string, DailyContentQuota> {
  const schedule = Object.fromEntries(dates.map((date) => [date, emptyQuota()])) as Record
    string,
    DailyContentQuota
  >;

  (Object.keys(totals) as ContentType[]).forEach((type) => {
    const want = totals[type] ?? 0;
    const count = Math.min(want, dates.length);
    for (let index = 0; index < count; index += 1) {
      const dateIndex = Math.floor((index * dates.length) / count);
      schedule[dates[dateIndex]!]![type] += 1;
    }
  });
  return schedule;
}

export const DEFAULT_PLATFORMS = [
  "LinkedIn",
  "Instagram",
  "Facebook",
  "X",
  "YouTube",
  "TikTok",
  "Pinterest",
];

/** Where each content type is allowed to be published. One platform-native
 *  home per type, except blog (syndicated) and carousel (native to both
 *  LinkedIn and Instagram). */
export const CHANNELS_BY_TYPE: Record<ContentType, string[]> = {
  blog: ["Website", "LinkedIn", "Medium", "Quora"],
  linkedin_post: ["LinkedIn"],
  instagram_post: ["Instagram"],
  instagram_reel: ["Instagram"],
  facebook_post: ["Facebook"],
  twitter_post: ["X"],
  pinterest: ["Pinterest"],
  youtube_short: ["YouTube"],
  tiktok_video: ["TikTok"],
  product_service_video: ["YouTube", "Website"],
  carousel: ["LinkedIn", "Instagram"],
};

export function activePlatforms(brand: BrandRow): string[] {
  const handles = brand.social_handles ?? {};
  const list = Object.entries(handles)
    .filter(([, v]) => typeof v === "string" && v.trim().length > 0)
    .map(([k]) => k);
  return list.length ? list : DEFAULT_PLATFORMS;
}

/** Intersect the brand's active channels with the channels valid for a type. */
export function platformsForType(active: string[], type: string): string[] {
  const allowed = CHANNELS_BY_TYPE[type as ContentType] ?? [];
  const picked = allowed.filter((p) => p === "Website" || active.includes(p));
  return picked.length ? picked : allowed;
}