import { Facebook, Globe, Instagram, Linkedin, Music2, Pin, Twitter, Youtube } from "lucide-react";

/** Which network a content type is published on, with its logo and brand colour. */
const BY_TYPE: Record<string, { name: string; Icon: typeof Instagram; color: string }> = {
  linkedin_post: { name: "LinkedIn", Icon: Linkedin, color: "#0A66C2" },
  instagram_post: { name: "Instagram", Icon: Instagram, color: "#E1306C" },
  instagram_reel: { name: "Instagram Reel", Icon: Instagram, color: "#E1306C" },
  facebook_post: { name: "Facebook", Icon: Facebook, color: "#1877F2" },
  twitter_post: { name: "X (Twitter)", Icon: Twitter, color: "#1DA1F2" },
  youtube_short: { name: "YouTube Short", Icon: Youtube, color: "#FF0000" },
  product_service_video: { name: "YouTube video", Icon: Youtube, color: "#FF0000" },
  tiktok_video: { name: "TikTok", Icon: Music2, color: "#25F4EE" },
  pinterest: { name: "Pinterest", Icon: Pin, color: "#E60023" },
  blog: { name: "Blog", Icon: Globe, color: "#94A3B8" },
  carousel: { name: "Carousel", Icon: Instagram, color: "#E1306C" },
};

export function PlatformIcon({ type, time, className = "h-4 w-4" }: { type: string; time?: string | null; className?: string }) {
  const p = BY_TYPE[type];
  const label = p ? `${p.name}${time ? ` · ${time}` : ""}` : type;
  if (!p) return <span className="text-[11px] text-muted-foreground">{time ?? ""}</span>;
  return (
    <span title={label} aria-label={label} className="inline-flex items-center">
      <p.Icon className={className} style={{ color: p.color }} />
    </span>
  );
}
