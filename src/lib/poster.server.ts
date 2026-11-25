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
  points: string[]; // up to 3 short, concrete selling points
  subline: string; // fallback line when there are no points
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

/**
 * On-image copy. The generator writes it into image_prompt as
 *   HEADLINE || FEATURE 1 || FEATURE 2 || FEATURE 3 || CTA
 * Older items (without that format) fall back to the title and summary.
 */
export function posterCopyFor(
  item: { title?: string | null; summary?: string | null; image_prompt?: string | null },
  brand: { website?: string | null },
): PosterCopy {
  const host = String(brand.website ?? "")
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/.*$/, "");
  const clip = (t: string, words: number) => t.replace(/[#*_"]/g, "").trim().split(/\s+/).slice(0, words).join(" ");
  const parts = String(item.image_prompt ?? "").split("||").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 3) {
    const cta = parts.length >= 5 ? parts[parts.length - 1]! : "";
    const points = parts.slice(1, parts.length >= 5 ? -1 : undefined).slice(0, 3).map((f) => clip(f, 6));
    return {
      headline: clip(parts[0]!, 8),
      points,
      subline: "",
      cta: clip(cta, 4) || (host ? `Visit ${host}` : "Learn more"),
    };
  }
  const sentence = String(item.summary ?? "").replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s/)[0] ?? "";
  return {
    headline: clip(String(item.title ?? ""), 9),
    points: [],
    subline: sentence.length > 118 ? `${sentence.slice(0, 115).replace(/\s+\S*$/, "")}…` : sentence,
    cta: host ? `Visit ${host}` : "Learn more",
  };
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

/** Checklist of feature lines. */
function pointsNode(points: string[], size: number, color: string, dot: string, maxWidth: number): Node | null {
  if (!points.length) return null;
  return h(
    "div",
    { flexDirection: "column", maxWidth },
    ...points.slice(0, 4).map((p) =>
      h(
        "div",
        { alignItems: "center", marginTop: size * 0.5 },
        h("div", { width: size * 0.72, height: size * 0.72, borderRadius: 9999, backgroundColor: dot, marginRight: size * 0.5, flexShrink: 0 }),
        h("div", { fontSize: size, fontWeight: 600, color, lineHeight: 1.25 }, p),
      ),
    ),
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

/** Logo (when uploaded) and the brand name, always both visible. */
function logoNode(brand: PosterBrand, height: number, textColor: string, chipBg?: string): Node {
  const name = h("div", { fontSize: height * 0.5, fontWeight: 800, color: textColor, letterSpacing: -0.5, marginLeft: brand.logo ? height * 0.3 : 0 }, brand.name.slice(0, 22));
  const inner = h(
    "div",
    { alignItems: "center" },
    brand.logo ? img(dataUri(brand.logo.bytes, brand.logo.mime), { height, objectFit: "contain" }) : null,
    name,
  );
  if (!chipBg) return inner;
  return h("div", { alignItems: "center", alignSelf: "flex-start", backgroundColor: chipBg, padding: `${height * 0.22}px ${height * 0.5}px`, borderRadius: 18 }, inner);
}

const strip = (t: string, re: RegExp) => t.replace(re, "").trim();

/** Check mark drawn with borders (the font has no tick glyph). */
function tick(size: number, color: string): Node {
  return h("div", { width: size, height: size * 0.55, borderLeft: `${size * 0.16}px solid ${color}`, borderBottom: `${size * 0.16}px solid ${color}`, transform: "rotate(-45deg)", marginTop: -size * 0.12 });
}

function numberBadge(n: number, size: number, bg: string): Node {
  return h("div", { width: size, height: size, borderRadius: 9999, backgroundColor: bg, color: onColor(bg), alignItems: "center", justifyContent: "center", fontSize: size * 0.5, fontWeight: 800, flexShrink: 0 }, String(n));
}

/** The newer templates. Returns null for ids it does not draw (the caller then uses the classic ones). */
function buildTemplate(
  id: string,
  W: number,
  H: number,
  photo: string | null,
  copy: PosterCopy,
  brand: PosterBrand,
): Node | null {
  const primary = cleanColor(brand.colors?.primary, "#4f46e5");
  const secondary = cleanColor(brand.colors?.secondary, "#0f172a");
  const accent = cleanColor(brand.colors?.accent, "#f59e0b");
  const pad = 72;
  const inner = W - pad * 2;
  const root = { width: W, height: H, fontFamily: "Poppins", position: "relative", overflow: "hidden", flexDirection: "column" } as const;
  const pts = copy.points.length ? copy.points : copy.subline ? [copy.subline] : [];
  const web = brand.website.replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  const fade = (bg: string, a: number) =>
    photo ? img(photo, { position: "absolute", top: 0, left: 0, width: W, height: H, objectFit: "cover", opacity: a }) : h("div", { position: "absolute", top: 0, left: 0, width: W, height: H, backgroundColor: bg });

  switch (id) {
    case "quote_card": {
      const fg = "#ffffff";
      return h("div", { ...root, backgroundColor: secondary, padding: pad },
        photo ? img(photo, { position: "absolute", top: 0, left: 0, width: W, height: H, objectFit: "cover" }) : null,
        h("div", { position: "absolute", top: 0, left: 0, width: W, height: H, backgroundColor: secondary, opacity: photo ? 0.84 : 0 }),
        h("div", { position: "absolute", top: 0, left: 0, width: W, height: H, backgroundImage: `linear-gradient(160deg, ${primary}55, ${secondary}00)` }),
        logoNode(brand, 58, "#0f172a", "#ffffffee"),
        h("div", { flexGrow: 1, flexDirection: "column", justifyContent: "center" },
          h("div", { fontSize: 300, fontWeight: 800, color: accent, lineHeight: 0.7, height: 150 }, "“"),
          h("div", { fontSize: copy.headline.length > 70 ? 62 : 76, fontWeight: 800, color: fg, lineHeight: 1.18, letterSpacing: -1, maxWidth: inner }, copy.headline),
          pts.length ? h("div", { marginTop: 44, fontSize: 30, fontWeight: 600, color: accent, maxWidth: inner }, pts.slice(0, 3).join("  ·  ")) : null),
        h("div", { justifyContent: "space-between", alignItems: "center" },
          pill(copy.cta, accent, 32),
          h("div", { fontSize: 28, fontWeight: 600, color: fg, opacity: 0.8 }, web)));
    }

    case "tips_list": {
      const rows = pts.slice(0, 3);
      return h("div", { ...root, backgroundColor: "#f8fafc", padding: pad },
        h("div", { position: "absolute", top: -W * 0.3, right: -W * 0.25, width: W * 0.8, height: W * 0.8, borderRadius: 9999, backgroundColor: primary, opacity: 0.1 }),
        logoNode(brand, 58, secondary),
        h("div", { marginTop: 40 }, headlineNode(copy.headline, 70, secondary, primary, inner)),
        h("div", { flexGrow: 1, flexDirection: "column", justifyContent: "center" },
          ...rows.map((t, i) =>
            h("div", { alignItems: "center", backgroundColor: "#ffffff", borderRadius: 32, padding: 30, marginTop: 26, border: "2px solid #e2e8f0" },
              numberBadge(i + 1, 84, primary),
              h("div", { marginLeft: 30, fontSize: 40, fontWeight: 600, color: "#1e293b", lineHeight: 1.22, maxWidth: inner - 190 }, t)))),
        h("div", { justifyContent: "space-between", alignItems: "center" }, pill(copy.cta, secondary, 32), h("div", { fontSize: 26, fontWeight: 600, color: "#64748b" }, web)));
    }

    case "stat_hero": {
      const fg = onColor(primary);
      const n = copy.headline.length;
      const size = n <= 4 ? 360 : n <= 7 ? 250 : n <= 11 ? 170 : 110;
      return h("div", { ...root, padding: pad, backgroundColor: primary },
        photo ? img(photo, { position: "absolute", top: 0, left: 0, width: W, height: H, objectFit: "cover", opacity: 0.2 }) : null,
        h("div", { position: "absolute", top: 0, left: 0, width: W, height: H, backgroundImage: `linear-gradient(180deg, ${primary}00, ${secondary}aa)` }),
        logoNode(brand, 58, fg),
        h("div", { flexGrow: 1, flexDirection: "column", justifyContent: "center" },
          h("div", { fontSize: size, fontWeight: 800, color: fg, lineHeight: 1, letterSpacing: -6, flexWrap: "wrap", maxWidth: inner }, copy.headline),
          h("div", { width: 160, height: 14, backgroundColor: accent, borderRadius: 8, marginTop: 36 }),
          pointsNode(pts, 40, fg, accent, inner)),
        h("div", { justifyContent: "space-between", alignItems: "center" }, pill(copy.cta, accent, 32), h("div", { fontSize: 26, fontWeight: 600, color: fg, opacity: 0.85 }, web)));
    }

    case "myth_fact": {
      const myth = strip(pts[0] ?? "", /^myth\s*[:\-]\s*/i);
      const fact = strip(pts[1] ?? "", /^fact\s*[:\-]\s*/i);
      const proof = pts[2] ?? "";
      if (!myth || !fact) return null;
      const card = (label: string, color: string, text: string, size: number, strike: boolean) =>
        h("div", { flexDirection: "column", backgroundColor: "#ffffff", borderRadius: 40, padding: 44, marginTop: 28, border: `6px solid ${color}` },
          h("div", { alignSelf: "flex-start", backgroundColor: color, color: "#ffffff", fontSize: 30, fontWeight: 800, padding: "8px 28px", borderRadius: 999, letterSpacing: 2 }, label),
          h("div", { marginTop: 24, fontSize: size, fontWeight: strike ? 600 : 800, color: strike ? "#64748b" : "#0f172a", lineHeight: 1.22, textDecoration: strike ? "line-through" : "none", maxWidth: inner - 90 }, text));
      return h("div", { ...root, backgroundColor: secondary, padding: pad },
        logoNode(brand, 56, "#0f172a", "#ffffffee"),
        h("div", { marginTop: 36, fontSize: 56, fontWeight: 800, color: "#ffffff", lineHeight: 1.1, maxWidth: inner }, copy.headline),
        h("div", { flexGrow: 1, flexDirection: "column", justifyContent: "center" },
          card("MYTH", "#ef4444", myth, 42, true),
          card("FACT", "#22c55e", fact, 48, false),
          proof ? h("div", { marginTop: 26, fontSize: 32, fontWeight: 600, color: "#e2e8f0", maxWidth: inner }, proof) : null),
        h("div", { justifyContent: "space-between", alignItems: "center" }, pill(copy.cta, accent, 32), h("div", { fontSize: 26, fontWeight: 600, color: "#ffffff", opacity: 0.8 }, web)));
    }

    case "checklist": {
      const fg = onColor(primary);
      return h("div", { ...root, backgroundColor: primary, padding: pad },
        logoNode(brand, 58, fg),
        h("div", { marginTop: 36 }, headlineNode(copy.headline, 72, fg, accent, inner)),
        h("div", { flexGrow: 1, flexDirection: "column", justifyContent: "center" },
          h("div", { flexDirection: "column", backgroundColor: "#ffffff", borderRadius: 44, padding: 48 },
            ...pts.slice(0, 3).map((t, i) =>
              h("div", { alignItems: "center", marginTop: i === 0 ? 0 : 38 },
                h("div", { width: 76, height: 76, borderRadius: 22, backgroundColor: accent, alignItems: "center", justifyContent: "center", flexShrink: 0 }, tick(38, onColor(accent))),
                h("div", { marginLeft: 32, fontSize: 40, fontWeight: 600, color: "#0f172a", lineHeight: 1.22, maxWidth: inner - 230 }, t))))),
        h("div", { justifyContent: "space-between", alignItems: "center" }, pill(copy.cta, accent, 32), h("div", { fontSize: 26, fontWeight: 600, color: fg, opacity: 0.85 }, web)));
    }

    case "split_photo": {
      if (!photo) return null;
      const fg = onColor(primary);
      const top = Math.round(H * 0.5);
      return h("div", { ...root, backgroundColor: primary },
        img(photo, { width: W, height: top, objectFit: "cover" }),
        h("div", { position: "absolute", top: pad * 0.7, left: pad }, logoNode(brand, 56, "#0f172a", "#ffffffee")),
        h("div", { width: W, height: 14, backgroundColor: accent }),
        h("div", { flexGrow: 1, flexDirection: "column", justifyContent: "space-between", padding: `${pad * 0.6}px ${pad}px ${pad}px ${pad}px` },
          h("div", { flexDirection: "column" },
            headlineNode(copy.headline, 66, fg, accent, inner),
            pointsNode(pts.slice(0, 3), 34, fg, accent, inner)),
          h("div", { justifyContent: "space-between", alignItems: "center" }, pill(copy.cta, accent, 30), h("div", { fontSize: 26, fontWeight: 600, color: fg, opacity: 0.85 }, web))));
    }

    case "offer_badge": {
      const fg = onColor(accent);
      return h("div", { ...root, backgroundColor: accent, padding: pad },
        photo ? img(photo, { position: "absolute", right: -W * 0.12, bottom: -W * 0.12, width: W * 0.5, height: W * 0.5, objectFit: "cover", borderRadius: 9999, border: `12px solid ${secondary}` }) : null,
        h("div", { justifyContent: "space-between", alignItems: "center" },
          logoNode(brand, 56, fg),
          h("div", { width: 190, height: 190, borderRadius: 9999, backgroundColor: secondary, color: onColor(secondary), alignItems: "center", justifyContent: "center", fontSize: 40, fontWeight: 800, letterSpacing: 2, transform: "rotate(12deg)" }, "OFFER")),
        h("div", { flexGrow: 1, flexDirection: "column", justifyContent: "center" },
          h("div", { fontSize: copy.headline.length > 28 ? 84 : 104, fontWeight: 800, color: fg, lineHeight: 1.02, letterSpacing: -2, maxWidth: inner }, copy.headline),
          h("div", { flexDirection: "column", marginTop: 40, maxWidth: inner },
            ...pts.slice(0, 3).map((t) => h("div", { alignItems: "center", marginTop: 14, fontSize: 36, fontWeight: 600, color: fg }, h("div", { width: 18, height: 18, borderRadius: 9999, backgroundColor: fg, marginRight: 20, flexShrink: 0 }), t)))),
        h("div", { justifyContent: "flex-start" }, pill(copy.cta, secondary, 38)));
    }

    case "steps_path": {
      const rows = pts.slice(0, 3);
      return h("div", { ...root, backgroundColor: secondary, padding: pad },
        logoNode(brand, 56, "#0f172a", "#ffffffee"),
        h("div", { marginTop: 36 }, headlineNode(copy.headline, 70, "#ffffff", accent, inner)),
        h("div", { flexGrow: 1, flexDirection: "column", justifyContent: "center" },
          ...rows.map((t, i) =>
            h("div", { flexDirection: "column" },
              h("div", { alignItems: "center" },
                numberBadge(i + 1, 96, accent),
                h("div", { marginLeft: 32, fontSize: 42, fontWeight: 600, color: "#ffffff", lineHeight: 1.22, maxWidth: inner - 150 }, t)),
              i < rows.length - 1 ? h("div", { width: 8, height: 54, backgroundColor: accent, opacity: 0.55, marginLeft: 44 }) : null))),
        h("div", { justifyContent: "space-between", alignItems: "center" }, pill(copy.cta, accent, 32), h("div", { fontSize: 26, fontWeight: 600, color: "#ffffff", opacity: 0.8 }, web)));
    }

    case "polaroid": {
      if (!photo) return null;
      const frameW = Math.round(W * 0.74);
      const frameH = Math.round(Math.min(H * 0.6, frameW * 1.12));
      return h("div", { ...root, padding: pad, backgroundImage: `linear-gradient(150deg, ${primary}, ${secondary})` },
        logoNode(brand, 56, "#0f172a", "#ffffffee"),
        h("div", { flexGrow: 1, alignItems: "center", justifyContent: "center" },
          h("div", { flexDirection: "column", width: frameW, backgroundColor: "#ffffff", padding: 28, paddingBottom: 18, borderRadius: 14, transform: "rotate(-4deg)" },
            img(photo, { width: frameW - 56, height: frameH - 190, objectFit: "cover" }),
            h("div", { marginTop: 24, fontSize: 38, fontWeight: 800, color: "#0f172a", lineHeight: 1.2, paddingBottom: 14 }, copy.headline))),
        pts.length ? h("div", { flexWrap: "wrap", justifyContent: "center", marginBottom: 26 }, ...pts.slice(0, 3).map((t) => h("div", { margin: 8, backgroundColor: "#ffffff22", color: "#ffffff", fontSize: 30, fontWeight: 600, padding: "10px 26px", borderRadius: 999, border: "2px solid #ffffff66" }, t))) : null,
        h("div", { justifyContent: "space-between", alignItems: "center" }, pill(copy.cta, accent, 32), h("div", { fontSize: 26, fontWeight: 600, color: "#ffffff", opacity: 0.85 }, web)));
    }

    case "spotlight_chips": {
      if (!photo) return null;
      const phH = Math.round(H * 0.46);
      return h("div", { ...root, padding: pad, backgroundImage: `linear-gradient(180deg, ${secondary}, #000000)` },
        logoNode(brand, 56, "#0f172a", "#ffffffee"),
        h("div", { marginTop: 36, width: inner, height: phH, borderRadius: 48, overflow: "hidden", border: `8px solid ${accent}` },
          img(photo, { width: inner - 16, height: phH - 16, objectFit: "cover" })),
        h("div", { flexGrow: 1, flexDirection: "column", justifyContent: "center" },
          headlineNode(copy.headline, 70, "#ffffff", accent, inner),
          h("div", { flexWrap: "wrap", marginTop: 26 }, ...pts.slice(0, 3).map((t) => h("div", { marginRight: 16, marginTop: 12, border: `3px solid ${accent}`, color: "#ffffff", fontSize: 30, fontWeight: 600, padding: "10px 28px", borderRadius: 999 }, t)))),
        h("div", { justifyContent: "space-between", alignItems: "center" }, pill(copy.cta, accent, 32), h("div", { fontSize: 26, fontWeight: 600, color: "#ffffff", opacity: 0.8 }, web)));
    }
  }
  return null;
}

function build(
  variant: number,
  W: number,
  H: number,
  photo: string | null,
  copy: PosterCopy,
  brand: PosterBrand,
  template?: string | null,
): Node {
  if (template) {
    const designed = buildTemplate(template, W, H, photo, copy, brand);
    if (designed) return designed;
  }
  const primary = cleanColor(brand.colors?.primary, "#4f46e5");
  const secondary = cleanColor(brand.colors?.secondary, "#0f172a");
  const accent = cleanColor(brand.colors?.accent, "#f59e0b");
  const pad = 72;
  const root = { width: W, height: H, fontFamily: "Poppins", position: "relative", overflow: "hidden" } as const;

  // No photo available (or the type-only template was chosen): bold type-only poster.
  if (!photo || template === "type_only") {
    return h(
      "div",
      { ...root, flexDirection: "column", justifyContent: "space-between", padding: pad, backgroundImage: `linear-gradient(135deg, ${primary}, ${secondary})` },
      logoNode(brand, 64, "#0f172a", "#ffffffee"),
      h("div", { flexDirection: "column" },
        headlineNode(copy.headline, 104, "#ffffff", accent, W - pad * 2),
        copy.points.length
          ? pointsNode(copy.points, 44, "#ffffff", accent, W - pad * 2)
          : copy.subline ? h("div", { fontSize: 38, fontWeight: 400, color: "#ffffffdd", marginTop: 32, lineHeight: 1.4, maxWidth: W - pad * 2 }, copy.subline) : null),
      h("div", {}, pill(copy.cta, accent, 36)),
    );
  }

  const classic: Record<string, number> = { hero_gradient: 0, color_block: 1, circle_ring: 2 };
  const v = template && template in classic ? classic[template]! : variant % 3;

  // 1) Full-bleed photo, text on a gradient.
  if (v === 0) {
    return h(
      "div",
      { ...root },
      img(photo, { position: "absolute", top: 0, left: 0, width: W, height: H, objectFit: "cover" }),
      h("div", { position: "absolute", left: 0, bottom: 0, width: W, height: H * 0.78, backgroundImage: "linear-gradient(to top, rgba(8,12,24,0.96) 55%, rgba(8,12,24,0))" }),
      h("div", { position: "absolute", top: pad * 0.7, left: pad }, logoNode(brand, 60, "#0f172a", "#ffffffee")),
      h("div", { position: "absolute", left: pad, bottom: pad, width: W - pad * 2, flexDirection: "column" },
        h("div", { width: 96, height: 10, backgroundColor: accent, borderRadius: 6, marginBottom: 30 }),
        headlineNode(copy.headline, copy.points.length ? 78 : 92, "#ffffff", accent, W - pad * 2),
        copy.points.length
          ? pointsNode(copy.points, 40, "#ffffff", accent, W - pad * 2)
          : copy.subline ? h("div", { fontSize: 36, fontWeight: 400, color: "#ffffffe0", marginTop: 26, lineHeight: 1.4 }, copy.subline) : null,
        h("div", { marginTop: 40 }, pill(copy.cta, accent, 34))),
    );
  }

  // 2) Brand-colour block with a rounded photo card.
  if (v === 1) {
    const fg = onColor(primary);
    const cardH = Math.round(Math.max(H * 0.28, H - (copy.points.length ? 822 : 942)));
    return h(
      "div",
      { ...root, flexDirection: "column", backgroundColor: primary, padding: pad },
      h("div", { justifyContent: "space-between", alignItems: "center", width: W - pad * 2 },
        logoNode(brand, 58, fg, fg === "#ffffff" ? undefined : undefined)),
      h("div", { marginTop: 40, flexDirection: "column" },
        headlineNode(copy.headline, copy.points.length ? 68 : 78, fg, accent, W - pad * 2),
        copy.points.length
          ? pointsNode(copy.points.slice(0, 3), 38, fg, accent, W - pad * 2)
          : copy.subline ? h("div", { fontSize: 32, fontWeight: 400, color: fg, opacity: 0.9, marginTop: 20, lineHeight: 1.4, maxHeight: 92, overflow: "hidden" }, copy.subline) : null),
      h("div", { position: "absolute", left: pad, bottom: pad + 110, width: W - pad * 2, height: cardH, borderRadius: 40, overflow: "hidden" },
        img(photo, { width: W - pad * 2, height: cardH, objectFit: "cover" })),
      h("div", { position: "absolute", left: pad, bottom: pad, width: W - pad * 2, justifyContent: "space-between", alignItems: "center" },
        pill(copy.cta, accent, 32),
        h("div", { fontSize: 28, fontWeight: 600, color: fg, opacity: 0.85 }, brand.website.replace(/^https?:\/\//i, "").replace(/\/.*$/, ""))),
    );
  }

  // 3) Light poster: copy on the left, photo in a ringed circle (agency-ad look).
  const circle = Math.round(W * (copy.points.length ? 0.66 : 0.78));
  return h(
    "div",
    { ...root, backgroundColor: "#f8fafc", flexDirection: "column", padding: pad },
    h("div", { position: "absolute", top: -W * 0.25, right: -W * 0.2, width: W * 0.75, height: W * 0.75, borderRadius: 9999, backgroundColor: primary, opacity: 0.12 }),
    h("div", { width: W - pad * 2, justifyContent: "space-between", alignItems: "center" }, logoNode(brand, 60, secondary)),
    h("div", { marginTop: 44, flexDirection: "column" },
      headlineNode(copy.headline, copy.points.length ? 74 : 94, secondary, primary, W - pad * 2),
      copy.points.length
        ? pointsNode(copy.points, 36, "#334155", primary, W * 0.58)
        : copy.subline ? h("div", { fontSize: 34, fontWeight: 400, color: "#475569", marginTop: 22, lineHeight: 1.4, maxWidth: W - pad * 2 - 40 }, copy.subline) : null),
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
  /** Template id from the variety planner; unset keeps the classic hash-picked layout. */
  template?: string | null;
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
    opts.template,
  );
  const svg = await satori(tree as never, {
    width: w,
    height: hh,
    fonts: [font(POPPINS_400, 400), font(POPPINS_600, 600), font(POPPINS_800, 800)],
  });
  return new Resvg(svg, { fitTo: { mode: "width", value: w } }).render().asPng();
}


/**
 * Transparent overlays for videos: a "hook" (logo + big headline) shown first, then a
 * "card" (feature checklist + call to action) for the rest of the clip.
 */
export async function composeVideoOverlays(opts: {
  copy: PosterCopy;
  brand: PosterBrand;
}): Promise<{ hook: Uint8Array; card: Uint8Array; width: number; height: number }> {
  const W = 1080;
  const H = 1920;
  const { copy, brand } = opts;
  const primary = cleanColor(brand.colors?.primary, "#4f46e5");
  const accent = cleanColor(brand.colors?.accent, "#f59e0b");
  const pad = 72;
  const base = { width: W, height: H, fontFamily: "Poppins", position: "relative" } as const;

  const hook = h(
    "div",
    { ...base },
    h("div", { position: "absolute", top: 120, left: pad }, logoNode(brand, 64, "#0f172a", "#ffffffee")),
    h("div", { position: "absolute", left: pad, right: pad, bottom: 420, flexDirection: "column", backgroundColor: "rgba(8,12,24,0.72)", borderRadius: 36, padding: 48 },
      h("div", { width: 96, height: 10, backgroundColor: accent, borderRadius: 6, marginBottom: 28 }),
      headlineNode(copy.headline, 84, "#ffffff", accent, W - pad * 2 - 96)),
  );

  const card = h(
    "div",
    { ...base },
    h("div", { position: "absolute", top: 120, left: pad }, logoNode(brand, 64, "#0f172a", "#ffffffee")),
    h("div", { position: "absolute", left: pad, right: pad, bottom: 300, flexDirection: "column", backgroundColor: "rgba(8,12,24,0.80)", borderRadius: 36, padding: 48 },
      h("div", { fontSize: 46, fontWeight: 800, color: "#ffffff", marginBottom: 6 }, brand.name.slice(0, 30)),
      pointsNode(copy.points.length ? copy.points : [copy.subline].filter(Boolean), 38, "#ffffff", accent, W - pad * 2 - 96),
      h("div", { marginTop: 40 }, pill(copy.cta, primary === accent ? "#ffffff" : accent, 36))),
  );

  const fonts = [
    { name: "Poppins", data: Buffer.from(POPPINS_400, "base64"), weight: 400 as const, style: "normal" as const },
    { name: "Poppins", data: Buffer.from(POPPINS_600, "base64"), weight: 600 as const, style: "normal" as const },
    { name: "Poppins", data: Buffer.from(POPPINS_800, "base64"), weight: 800 as const, style: "normal" as const },
  ];
  const satori = (await import("satori")).default;
  const { Resvg } = await import("@resvg/resvg-js");
  const render = async (tree: Node) =>
    new Resvg(await satori(tree as never, { width: W, height: H, fonts }), { fitTo: { mode: "width", value: W } })
      .render()
      .asPng();
  return { hook: await render(hook), card: await render(card), width: W, height: H };
}

/* ---------------------------------------------------------------------------------------------
 * Carousel slides, drawn by the app (exact text, brand colours, one consistent look per carousel)
 * instead of one AI image per slide. Only the cover may carry a photo.
 * ------------------------------------------------------------------------------------------- */

export type CarouselStyle = "light" | "bold" | "dark";
export const CAROUSEL_STYLES: CarouselStyle[] = ["light", "bold", "dark"];

function chevron(size: number, color: string): Node {
  return h("div", { width: size, height: size, borderTop: `${size * 0.22}px solid ${color}`, borderRight: `${size * 0.22}px solid ${color}`, transform: "rotate(45deg)" });
}

function dots(total: number, current: number, on: string, off: string): Node {
  return h("div", { alignItems: "center" },
    ...Array.from({ length: Math.min(total, 8) }, (_, i) =>
      h("div", { width: i === current ? 46 : 16, height: 16, borderRadius: 9999, backgroundColor: i === current ? on : off, marginRight: 12 })));
}

function buildSlide(
  slide: { headline: string; subtext: string },
  index: number,
  total: number,
  W: number,
  H: number,
  photo: string | null,
  brand: PosterBrand,
  style: CarouselStyle,
): Node {
  const primary = cleanColor(brand.colors?.primary, "#4f46e5");
  const secondary = cleanColor(brand.colors?.secondary, "#0f172a");
  const accent = cleanColor(brand.colors?.accent, "#f59e0b");
  const pad = 80;
  const inner = W - pad * 2;
  const web = brand.website.replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  const isCover = index === 0;
  const isLast = total > 1 && index === total - 1;

  const bg = style === "light" ? "#f8fafc" : style === "bold" ? primary : secondary;
  const fg = style === "light" ? secondary : onColor(bg);
  const sub = style === "light" ? "#475569" : fg;
  const hi = style === "light" ? primary : accent;
  const dotOn = style === "light" ? primary : accent;
  const dotOff = style === "light" ? "#cbd5e1" : "#ffffff44";
  const root = { width: W, height: H, fontFamily: "Poppins", position: "relative", overflow: "hidden", flexDirection: "column", padding: pad, backgroundColor: bg } as const;

  const head = (size: number) => headlineNode(slide.headline, size, fg, hi, inner);
  const subline = (size: number) =>
    slide.subtext ? h("div", { fontSize: size, fontWeight: 400, color: sub, opacity: style === "light" ? 1 : 0.92, lineHeight: 1.4, marginTop: 30, maxWidth: inner }, slide.subtext) : null;
  const decor = h("div", { position: "absolute", top: -W * 0.28, right: -W * 0.22, width: W * 0.8, height: W * 0.8, borderRadius: 9999, backgroundColor: hi, opacity: style === "light" ? 0.1 : 0.16 });
  const topRow = h("div", { justifyContent: "space-between", alignItems: "center", width: inner },
    logoNode(brand, 58, fg, style === "light" ? undefined : undefined),
    h("div", { fontSize: 32, fontWeight: 600, color: hi }, `${String(index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`));
  const bottomRow = h("div", { justifyContent: "space-between", alignItems: "center", width: inner },
    dots(total, index, dotOn, dotOff),
    isLast ? null : h("div", { alignItems: "center" }, h("div", { fontSize: 30, fontWeight: 600, color: fg, marginRight: 22, opacity: 0.85 }, "Swipe"), chevron(26, hi)));

  if (isCover) {
    return h("div", { ...root }, decor, topRow,
      photo ? h("div", { marginTop: 44, width: inner, height: Math.round(H * 0.36), borderRadius: 44, overflow: "hidden" }, img(photo, { width: inner, height: Math.round(H * 0.36), objectFit: "cover" })) : null,
      h("div", { flexGrow: 1, flexDirection: "column", justifyContent: "center" },
        head(photo ? 78 : 100), subline(photo ? 32 : 38)),
      bottomRow);
  }

  if (isLast) {
    return h("div", { ...root }, decor, topRow,
      h("div", { flexGrow: 1, flexDirection: "column", justifyContent: "center" },
        head(84), subline(38),
        h("div", { marginTop: 54 }, pill(web ? `Visit ${web}` : "Get started", hi, 40))),
      bottomRow);
  }

  return h("div", { ...root }, decor, topRow,
    h("div", { flexGrow: 1, flexDirection: "column", justifyContent: "center" },
      h("div", { width: 120, height: 12, backgroundColor: hi, borderRadius: 8, marginBottom: 36 }),
      head(slide.headline.length > 46 ? 68 : 82), subline(40)),
    bottomRow);
}

let satoriChain: Promise<unknown> = Promise.resolve();

/** Layout runs one at a time: satori's wasm layout engine can abort when several run together. */
export function composeCarouselSlide(opts: Parameters<typeof composeCarouselSlideOnce>[0]): Promise<Uint8Array> {
  const run = async () => {
    try {
      return await composeCarouselSlideOnce(opts);
    } catch (first) {
      console.error("[carousel] slide layout failed, retrying without photo/logo", first);
      return composeCarouselSlideOnce({ ...opts, photo: null, brand: { ...opts.brand, logo: null } });
    }
  };
  const next = satoriChain.then(run, run);
  satoriChain = next.catch(() => undefined);
  return next;
}

async function composeCarouselSlideOnce(opts: {
  slide: { headline: string; subtext: string };
  index: number;
  total: number;
  brand: PosterBrand;
  photo: Uint8Array | null;
  style: CarouselStyle;
  aspect?: string;
}): Promise<Uint8Array> {
  const { w, h: hh } = sizeFor(opts.aspect ?? "4:5");
  const satori = (await import("satori")).default;
  const { Resvg } = await import("@resvg/resvg-js");
  const font = (b64: string, weight: 400 | 600 | 800) => ({ name: "Poppins", data: Buffer.from(b64, "base64"), weight, style: "normal" as const });
  const clip = (t: string, words: number) => t.replace(/[#*_"]/g, "").trim().split(/\s+/).slice(0, words).join(" ");
  const tree = buildSlide(
    { headline: clip(opts.slide.headline, 12), subtext: clip(opts.slide.subtext, 28) },
    opts.index,
    opts.total,
    w,
    hh,
    opts.photo ? dataUri(opts.photo) : null,
    opts.brand,
    opts.style,
  );
  const svg = await satori(tree as never, { width: w, height: hh, fonts: [font(POPPINS_400, 400), font(POPPINS_600, 600), font(POPPINS_800, 800)] });
  return new Resvg(svg, { fitTo: { mode: "width", value: w } }).render().asPng();
}
