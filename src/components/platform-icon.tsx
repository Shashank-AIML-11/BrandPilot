import { Globe, Linkedin } from "lucide-react";

/** Which network a content type is published on. Round logos live in /public/platforms. */
const BY_TYPE: Record<string, { name: string; img?: string }> = {
  linkedin_post: { name: "LinkedIn" },
  instagram_post: { name: "Instagram", img: "instagram" },
  instagram_reel: { name: "Instagram Reel", img: "instagram" },
  facebook_post: { name: "Facebook", img: "facebook" },
  twitter_post: { name: "X (Twitter)", img: "twitter" },
  youtube_short: { name: "YouTube Short", img: "youtube" },
  product_service_video: { name: "YouTube video", img: "youtube" },
  tiktok_video: { name: "TikTok", img: "tiktok" },
  pinterest: { name: "Pinterest", img: "pinterest" },
  blog: { name: "Blog" },
  carousel: { name: "Carousel", img: "instagram" },
};

/** The logo of the network a piece goes to. Hover shows its name and posting time. */
export function PlatformIcon({ type, time, size = 20 }: { type: string; time?: string | null; size?: number }) {
  const p = BY_TYPE[type];
  if (!p) return <span className="text-[11px] text-muted-foreground">{time ?? ""}</span>;
  const label = `${p.name}${time ? ` · ${time}` : ""}`;
  return (
    <span title={label} aria-label={label} role="img" className="inline-flex flex-none items-center">
      {p.img ? (
        <img src={`/platforms/${p.img}.png`} alt="" width={size} height={size} className="rounded-full" style={{ width: size, height: size }} />
      ) : type === "linkedin_post" ? (
        <span className="inline-flex items-center justify-center rounded-full bg-[#0A66C2]" style={{ width: size, height: size }}>
          <Linkedin className="text-white" style={{ width: size * 0.6, height: size * 0.6 }} />
        </span>
      ) : (
        <span className="inline-flex items-center justify-center rounded-full bg-slate-500" style={{ width: size, height: size }}>
          <Globe className="text-white" style={{ width: size * 0.62, height: size * 0.62 }} />
        </span>
      )}
    </span>
  );
}
