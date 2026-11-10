/**
 * Poster composer. Server-only.
 *
 * The AI model supplies only a photo (no text). This file lays the photo out in a designed
 * template with sharp, correctly spelled headline text, the brand colours and the logo,
 * so posts look designed by a person instead of drawn by one model in one go.
 * If anything fails the caller keeps the plain photo, so generation never breaks.
 */
import { POPPINS_400, POPPINS_600, POPPINS_800 } from "@/lib/poster-fonts";

export interface PosterBrand {
  name: string;
  website: string;
  logo?: { bytes: Uint8Array; mime: string } | null;
  colors?: { primary?: string; secondary?: string; accent?: string } | null;
}

export interface PosterCopy {
  headline: string;
  subline: string;
  cta: string;
}

type Node = { type: string; props: Record<string, unknown> };
type Child = Node | string | null | false | undefined;

const h = (type: string, style: Record<string, unknown>, ...children: Child[]): Node => ({
  type,
  props: { style: { display: "flex", ...style }, children: children.filter(Boolean) },
});
const img = (src: string, style: Record<string, unknown>): Node => ({
  type: "img",
  props: { src, style },
});

const HEX = /^#[0-9a-f]{6}$/i;
export function cleanColor(value: unknown, fallback: string): string {
  const v = String(value ?? "").trim();
  return HEX.test(v) ? v : fallback;
}
function lum(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
}
const onColor = (bg: string) => (lum(bg) > 0.42 ? "#0f172a" : "#ffffff");

function mimeOf(b: Uint8Array): string {
  if (b[0] === 0x89 && b[1] === 0x50) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8) return "image/jpeg";
  return "image/png";
}
const dataUri = (bytes: Uint8Array, mime = mimeOf(bytes)) =>
  `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;

const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

/** Short, correctly spelled on-image copy derived from the generated post. */
export function posterCopyFor(
  item: { title?: string | null; summary?: string | null },
  brand: { website?: string | null },
): PosterCopy {
  const words = String(item.title ?? "").replace(/[#*_"]/g, "").trim().split(/\s+/).filter(Boolean);
  const headline = words.slice(0, 9).join(" ");
  const sentence = String(item.summary ?? "").replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s/)[0] ?? "";
  const subline = sentence.length > 118 ? `${sentence.slice(0, 115).replace(/\s+\S*$/, "")}…` : sentence;
  const host = String(brand.website ?? "")
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/.*$/, "");
  return { headline, subline, cta: host ? `Visit ${host}` : "Learn more" };
}

function sizeFor(aspect: string): { w: number; h: number } {
  const m = /(\d+):(\d+)/.exec(aspect);
  const w = 1080;
  if (!m) return { w, h: w };
  return { w, h: Math.round((w * Number(m[2])) / Number(m[1])) };
}

/** Headline with the last two words in the accent colour. */
function headlineNode(text: string, size: number, color: string, accent: string, maxWidth: number): Node {
  const words = text.split(" ");
  const split = Math.max(words.length - 2, 1);
  const parts = words.map((w, i) =>
    h("div", { color: i >= split && words.length > 3 ? accent : color, marginRight: size * 0.28 }, w),
  );
  return h(
    "div",
    { flexWrap: "wrap", fontSize: size, fontWeight: 800, lineHeight: 1.08, letterSpacing: -1, maxWidth },
    ...parts,
  );
}

function pill(text: string, bg: string, size: number): Node {
  return h(
    "div",
    {
      backgroundColor: bg,
      color: onColor(bg),
      fontSize: size,
      fontWeight: 600,
      padding: `${size * 0.55}px ${size * 1.4}px`,
      borderRadius: 999,
    },
    text,
  );
}

function logoNode(
  brand: PosterBrand,
  height: number,
  textColor: string,
  chipBg?: string,
): Node {
  const inner = brand.logo
    ? img(dataUri(brand.logo.bytes, brand.logo.mime), { height, objectFit: "contain" })
    : h("div", { fontSize: height * 0.55, fontWeight: 800, color: textColor, letterSpacing: -0.5 }, brand.name.slice(0, 22));
  if (!chipBg) return h("div", { alignItems: "center" }, inner);
  return h("div", { alignItems: "center", alignSelf: "flex-start", backgroundColor: chipBg, padding: `${height * 0.25}px ${height * 0.5}px`, borderRadius: 18 }, inner);
}

function build(
  variant: number,
  W: number,
  H: number,
  photo: string | null,
  copy: PosterCopy,
  brand: PosterBrand,
): Node {
  const primary = cleanColor(brand.colors?.primary, "#4f46e5");
  const secondary = cleanColor(brand.colors?.secondary, "#0f172a");
  const accent = cleanColor(brand.colors?.accent, "#f59e0b");
  const pad = 72;
  const root = { width: W, height: H, fontFamily: "Poppins", position: "relative", overflow: "hidden" } as const;

  // No photo available: bold type-only poster.
  if (!photo) {
    return h(
      "div",
      { ...root, flexDirection: "column", justifyContent: "space-between", padding: pad, backgroundImage: `linear-gradient(135deg, ${primary}, ${secondary})` },
      logoNode(brand, 64, "#0f172a", "#ffffffee"),
      h("div", { flexDirection: "column" },
        headlineNode(copy.headline, 104, "#ffffff", accent, W - pad * 2),
        copy.subline ? h("div", { fontSize: 38, fontWeight: 400, color: "#ffffffdd", marginTop: 32, lineHeight: 1.4, maxWidth: W - pad * 2 }, copy.subline) : null),
      h("div", {}, pill(copy.cta, accent, 36)),
    );
  }

  const v = variant % 3;

  // 1) Full-bleed photo, text on a gradient.
  if (v === 0) {
    return h(
      "div",
      { ...root },
      img(photo, { position: "absolute", top: 0, left: 0, width: W, height: H, objectFit: "cover" }),
      h("div", { position: "absolute", left: 0, bottom: 0, width: W, height: H * 0.62, backgroundImage: "linear-gradient(to top, rgba(8,12,24,0.94), rgba(8,12,24,0))" }),
      h("div", { position: "absolute", top: pad * 0.7, left: pad }, logoNode(brand, 60, "#0f172a", "#ffffffee")),
      h("div", { position: "absolute", left: pad, bottom: pad, width: W - pad * 2, flexDirection: "column" },
        h("div", { width: 96, height: 10, backgroundColor: accent, borderRadius: 6, marginBottom: 30 }),
        headlineNode(copy.headline, 92, "#ffffff", accent, W - pad * 2),
        copy.subline ? h("div", { fontSize: 36, fontWeight: 400, color: "#ffffffe0", marginTop: 26, lineHeight: 1.4 }, copy.subline) : null,
        h("div", { marginTop: 40 }, pill(copy.cta, accent, 34))),
    );
  }

  // 2) Brand-colour block with a rounded photo card.
  if (v === 1) {
    const fg = onColor(primary);
    const cardH = Math.round(Math.max(H * 0.3, H - 942));
    return h(
      "div",
      { ...root, flexDirection: "column", backgroundColor: primary, padding: pad },
      h("div", { justifyContent: "space-between", alignItems: "center", width: W - pad * 2 },
        logoNode(brand, 58, fg, fg === "#ffffff" ? undefined : undefined)),
      h("div", { marginTop: 40, flexDirection: "column" },
        headlineNode(copy.headline, 78, fg, accent, W - pad * 2),
        copy.subline ? h("div", { fontSize: 32, fontWeight: 400, color: fg, opacity: 0.9, marginTop: 20, lineHeight: 1.4, maxHeight: 92, overflow: "hidden" }, copy.subline) : null),
      h("div", { position: "absolute", left: pad, bottom: pad + 110, width: W - pad * 2, height: cardH, borderRadius: 40, overflow: "hidden" },
        img(photo, { width: W - pad * 2, height: cardH, objectFit: "cover" })),
      h("div", { position: "absolute", left: pad, bottom: pad, width: W - pad * 2, justifyContent: "space-between", alignItems: "center" },
        pill(copy.cta, accent, 32),
        h("div", { fontSize: 28, fontWeight: 600, color: fg, opacity: 0.85 }, brand.website.replace(/^https?:\/\//i, "").replace(/\/.*$/, ""))),
    );
  }

  // 3) Light poster: copy on the left, photo in a ringed circle (agency-ad look).
  const circle = Math.round(W * 0.78);
  return h(
    "div",
    { ...root, backgroundColor: "#f8fafc", flexDirection: "column", padding: pad },
    h("div", { position: "absolute", top: -W * 0.25, right: -W * 0.2, width: W * 0.75, height: W * 0.75, borderRadius: 9999, backgroundColor: primary, opacity: 0.12 }),
    h("div", { width: W - pad * 2, justifyContent: "space-between", alignItems: "center" }, logoNode(brand, 60, secondary)),
    h("div", { marginTop: 44, flexDirection: "column" },
      headlineNode(copy.headline, 94, secondary, primary, W - pad * 2),
      copy.subline ? h("div", { fontSize: 34, fontWeight: 400, color: "#475569", marginTop: 22, lineHeight: 1.4, maxWidth: W - pad * 2 - 40 }, copy.subline) : null),
    h("div", { position: "absolute", right: -circle * 0.12, bottom: -circle * 0.18, width: circle, height: circle, borderRadius: 9999, backgroundColor: primary, alignItems: "center", justifyContent: "center" },
      h("div", { width: circle - 36, height: circle - 36, borderRadius: 9999, overflow: "hidden" },
        img(photo, { width: circle - 36, height: circle - 36, objectFit: "cover" }))),
    h("div", { position: "absolute", left: pad, bottom: pad }, pill(copy.cta, secondary, 32)),
  );
}

export async function composePoster(opts: {
  photo: Uint8Array | null;
  copy: PosterCopy;
  brand: PosterBrand;
  aspect: string;
  seed: string;
}): Promise<Uint8Array> {
  const { w, h: hh } = sizeFor(opts.aspect);
  const satori = (await import("satori")).default;
  const { Resvg } = await import("@resvg/resvg-js");
  const font = (b64: string, weight: 400 | 600 | 800) => ({
    name: "Poppins",
    data: Buffer.from(b64, "base64"),
    weight,
    style: "normal" as const,
  });
  const tree = build(
    hash(opts.seed),
    w,
    hh,
    opts.photo ? dataUri(opts.photo) : null,
    opts.copy,
    opts.brand,
  );
  const svg = await satori(tree as never, {
    width: w,
    height: hh,
    fonts: [font(POPPINS_400, 400), font(POPPINS_600, 600), font(POPPINS_800, 800)],
  });
  return new Resvg(svg, { fitTo: { mode: "width", value: w } }).render().asPng();
}
