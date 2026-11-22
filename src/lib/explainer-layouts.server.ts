/**
 * Explainer Pro — the scene layout library.
 *
 * Each layout draws ONE scene as an HTML page (720 wide) that Shotstack renders as a still layer.
 * The AI script writer picks a layout per scene and fills in plain text fields; this file turns
 * those fields into a designed screen. It is brand-neutral: colours come from the brand profile,
 * text from the AI, icons from the small set below. No layout invents facts — it only shows what
 * the script gives it.
 *
 * Layers: layouts that show a photo / illustration (`image`) are drawn with a transparent
 * background so the picture can sit underneath; every other layout paints its own background
 * (light dotted, dark, or gradient).
 */

import { FONT_CSS } from "@/lib/explainer-font.server";

export const W = 720;

export interface Item {
  t: string; // title
  d: string; // description
  i: string; // icon name
}
export interface Stat {
  v: string;
  l: string;
}
export interface SceneFields {
  layout: string;
  voice: string;
  title: string;
  sub: string;
  items: Item[];
  stats: Stat[];
  a: string[];
  b: string[];
  img: string;
}

export interface Theme {
  primary: string;
  secondary: string;
  accent: string;
  onAccent: string; // readable text colour on top of accent
  onPrimary: string;
  brand: string;
  website: string;
  cta: string;
  hasLogo: boolean;
  H: number;
  /** false = rely on the system font (Arial); keeps the render request small */
  embedFont?: boolean;
}

export const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const clip = (s: string, n: number) => {
  const t = (s ?? "").trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
};

export function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = Number.parseInt(full.slice(0, 6), 16);
  if (!Number.isFinite(n)) return 0.5;
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
}
export const readableOn = (hex: string) => (luminance(hex) > 0.45 ? "#0f172a" : "#ffffff");

// ---------------------------------------------------------------- icons (24x24, stroke only)
const ICONS: Record<string, string> = {
  check: '<path d="M5 13l4 4L19 7"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  heart: '<path d="M12 21s-7-4.5-9.5-9A5.5 5.5 0 0112 6a5.5 5.5 0 019.5 6c-2.5 4.5-9.5 9-9.5 9z"/>',
  star: '<path d="M12 2l3 7 7 .6-5.3 4.7L18.5 22 12 18l-6.5 4 1.8-7.7L2 9.6 9 9z"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  cart: '<path d="M3 4h3l2.5 11h9L20 7H7"/><circle cx="9" cy="20" r="1.3"/><circle cx="17" cy="20" r="1.3"/>',
  phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  pin: '<path d="M12 21s7-6 7-11a7 7 0 10-14 0c0 5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  tag: '<path d="M3 12l9-9h8v8l-9 9z"/><circle cx="16" cy="8" r="1.4"/>',
  gift: '<rect x="4" y="9" width="16" height="11"/><path d="M12 9v11M3 9h18V6H3z"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  play: '<path d="M7 4l13 8-13 8z"/>',
  camera: '<rect x="3" y="7" width="18" height="13" rx="2"/><circle cx="12" cy="13" r="3.5"/>',
  wallet: '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M16 13h3"/>',
  leaf: '<path d="M5 19c0-9 5-14 15-14 0 10-5 15-14 15zM5 19l8-8"/>',
  tools: '<path d="M14 6a4 4 0 005 5l-9 9-3-3z"/>',
  bell: '<path d="M6 16v-5a6 6 0 0112 0v5l2 2H4zM10 21h4"/>',
  book: '<path d="M4 5h7a3 3 0 013 3v12a3 3 0 00-3-3H4zM14 8a3 3 0 013-3h3v12h-3a3 3 0 00-3 3"/>',
  spark: '<path d="M12 3l2 6 6 3-6 3-2 6-2-6-6-3 6-3z"/>',
  whatsapp: '<path d="M4 20l1.4-4.2A8 8 0 1112 20a8 8 0 01-3.6-.9z"/><path d="M9 9c0 3 3 6 6 6"/>',
};
const ICON_NAMES = Object.keys(ICONS);
export const ICON_LIST = ICON_NAMES.join(", ");

function icon(name: string, color: string, size = 34) {
  const body = ICONS[name] ?? ICONS["spark"]!;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

// ---------------------------------------------------------------- shared CSS
function baseCss(T: Theme, dark: boolean) {
  const ink = dark ? "#ffffff" : "#0f172a";
  const soft = dark ? "rgba(255,255,255,.72)" : "#475569";
  const card = dark ? "rgba(255,255,255,.08)" : "#ffffff";
  const line = dark ? "rgba(255,255,255,.16)" : "rgba(15,23,42,.10)";
  return `${T.embedFont === false ? "" : FONT_CSS}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${W}px;height:${T.H}px;margin:0;padding:0;overflow:hidden}
body{font-family:'Montserrat',Arial,Helvetica,sans-serif;color:${ink}}
@keyframes rise{from{opacity:0;transform:translateY(60px) scale(.96)}to{opacity:1;transform:none}}
@keyframes pop{0%{opacity:0;transform:scale(.6)}70%{opacity:1;transform:scale(1.06)}100%{opacity:1;transform:scale(1)}}
@keyframes wordin{from{opacity:0;transform:translateY(18px) scale(.9)}to{opacity:1;transform:none}}
@keyframes sweep{from{width:0}to{width:84px}}
@keyframes float1{from{transform:translate(0,0) scale(1)}to{transform:translate(70px,90px) scale(1.25)}}
@keyframes float2{from{transform:translate(0,0) scale(1.1)}to{transform:translate(-80px,-60px) scale(.9)}}
@keyframes zoomslow{from{transform:scale(1)}to{transform:scale(1.045)}}
@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.07)}}
@keyframes wiggle{0%,100%{transform:rotate(0)}25%{transform:rotate(-8deg)}75%{transform:rotate(8deg)}}
@keyframes fillbar{from{transform:scaleX(0)}to{transform:scaleX(1)}}
.blob{position:absolute;border-radius:50%;filter:blur(60px);opacity:.28;z-index:0}
.b1{width:420px;height:420px;left:-120px;top:14%;background:${T.accent};animation:float1 6s ease-in-out infinite alternate}
.b2{width:460px;height:460px;right:-160px;bottom:12%;background:${dark ? T.primary : T.primary};opacity:${dark ? 0.5 : 0.2};animation:float2 7s ease-in-out infinite alternate}
.top,.body,.cap{position:relative;z-index:1}
.f{animation:zoomslow 6s ease-out both}
.body>*{animation:rise .55s cubic-bezier(.2,.9,.25,1.1) both}
.body>.bar{animation:sweep .5s .1s both}
.col>*,.body>div>.card,.body>div>.chip{animation:pop .6s cubic-bezier(.2,.9,.25,1.1) both}
.col>*:nth-child(2){animation-delay:.22s}.col>*:nth-child(3){animation-delay:.44s}.col>*:nth-child(4){animation-delay:.66s}.col>*:nth-child(5){animation-delay:.88s}
.ic svg{animation:wiggle 1.2s .8s ease-in-out 2}
.phone{animation:pop .7s cubic-bezier(.2,.9,.25,1.1) both}
.btn{animation:pop .6s .5s both,pulse 1.1s 1.2s ease-in-out infinite}
.cap .w{display:inline-block;opacity:0;animation:wordin .28s ease-out forwards}
.cap b.w{animation:wordin .28s ease-out forwards,pulse .6s ease-in-out 1}
.prog i.on:last-child{transform-origin:left;animation:fillbar 4s linear both}
.f{position:relative;width:${W}px;height:${T.H}px;display:flex;flex-direction:column}
.top{height:${Math.round(T.H * 0.105)}px;padding:34px 40px 0 ${T.hasLogo ? 128 : 40}px;display:flex;align-items:center;gap:10px;font-weight:700;font-size:21px;color:${soft}}
.prog{position:absolute;left:40px;right:40px;top:18px;display:flex;gap:6px}
.prog i{flex:1;height:5px;border-radius:3px;background:${line}}
.prog i.on{background:${T.accent}}
.body{flex:1;padding:6px 48px 0;display:flex;flex-direction:column;justify-content:center;min-height:0}
.cap{padding:0 44px ${Math.round(T.H * 0.085)}px;text-align:center;font-weight:800;font-size:${T.H < 1000 ? 28 : 31}px;line-height:1.3;color:${ink}}
.cap b{font-weight:800;background:${T.accent};color:${T.onAccent};padding:1px 9px;border-radius:7px;box-decoration-break:clone;-webkit-box-decoration-break:clone}
h1{font-weight:800;font-size:${T.H < 1000 ? 56 : 64}px;line-height:1.1;letter-spacing:-.5px}
h1 em,h2 em{font-style:normal;color:${T.accent}}
h2{font-weight:800;font-size:${T.H < 1000 ? 42 : 46}px;line-height:1.15}
.sub{margin-top:16px;font-size:28px;font-weight:600;line-height:1.35;color:${soft}}
.bar{width:84px;height:8px;border-radius:4px;background:${T.accent};margin:0 0 20px}
.card{background:${card};border:2px solid ${line};border-radius:28px;padding:26px 28px;box-shadow:0 14px 40px rgba(15,23,42,${dark ? 0 : 0.08})}
.ic{width:66px;height:66px;border-radius:20px;background:${T.accent};display:flex;align-items:center;justify-content:center;flex:none}
.row{display:flex;align-items:center;gap:20px}
.col{display:flex;flex-direction:column;gap:18px}
.t{font-weight:800;font-size:30px;line-height:1.2}
.d{font-weight:600;font-size:23px;line-height:1.3;color:${soft};margin-top:4px}
.chip{display:inline-flex;align-items:center;gap:10px;padding:14px 24px;border-radius:40px;background:${card};border:2px solid ${line};font-weight:800;font-size:25px}
.chip.a{background:${T.accent};color:${T.onAccent};border-color:${T.accent}}
.phone{width:430px;margin:0 auto;border-radius:56px;border:9px solid #0f172a;background:#fff;color:#0f172a;box-shadow:0 24px 60px rgba(15,23,42,.28);overflow:hidden}
.phone .notch{width:130px;height:28px;border-radius:0 0 18px 18px;background:#0f172a;margin:0 auto}
.phone .scr{padding:14px 18px 20px}
.btn{display:inline-block;background:${T.accent};color:${T.onAccent};font-weight:800;font-size:30px;padding:20px 46px;border-radius:60px}
`;
}

// ---------------------------------------------------------------- layouts
export interface Layout {
  id: string;
  use: string; // shown to the AI
  dark?: boolean; // paints its own dark/gradient background
  image?: "photo" | "art" | "video"; // needs a picture or stock clip under the page
  ok: (s: SceneFields) => boolean;
  html: (s: SceneFields, T: Theme) => string;
}

const heading = (s: SceneFields, tag = "h1") => `<div class="bar"></div><${tag}>${emph(s.title)}</${tag}>${s.sub ? `<div class="sub">${esc(clip(s.sub, 120))}</div>` : ""}`;
/** **word** in a title becomes the accent colour. */
function emph(text: string) {
  return esc(clip(text, 90)).replace(/\*\*(.+?)\*\*/g, "<em>$1</em>");
}
const plain = (t: string) => (t ?? "").replace(/\*\*/g, "");
const items = (s: SceneFields, n = 5) => s.items.slice(0, n);
const hasItems = (n: number) => (s: SceneFields) => s.items.filter((x) => x.t).length >= n;

const phone = (inner: string) => `<div class="phone"><div class="notch"></div><div class="scr">${inner}</div></div>`;

export const LAYOUTS: Layout[] = [
  {
    id: "hook",
    use: "Opening line or any bold single message. Big headline (wrap one key word in **double stars**) and an optional subline.",
    ok: (s) => Boolean(s.title),
    html: (s) => `<div class="body">${heading(s)}</div>`,
  },
  {
    id: "brand_intro",
    use: "Introduce the brand: big name, then the tagline in sub. Use as scene 2 after a hook, or scene 1.",
    ok: (s) => Boolean(s.title),
    html: (s, T) => `<div class="body" style="align-items:center;text-align:center"><div class="bar" style="margin:0 auto 24px"></div><h1>${esc(T.brand)}</h1>${s.sub || s.title ? `<div class="sub">${esc(clip(s.sub || s.title, 110))}</div>` : ""}</div>`,
  },
  {
    id: "statement",
    dark: true,
    use: "Dark full-screen big statement or promise. Title only (wrap one key word in **stars**), optional sub.",
    ok: (s) => Boolean(s.title),
    html: (s) => `<div class="body" style="justify-content:center">${heading(s)}</div>`,
  },
  {
    id: "stat_hero",
    use: "ONE big number or fact with its label (e.g. '10 min' / 'setup time'). Only if the number is in the brand information. stats[0]=value+label, title=short intro, sub=detail.",
    ok: (s) => Boolean(s.stats[0]?.v),
    html: (s, T) => `<div class="body"><h2>${emph(s.title)}</h2><div class="card" style="margin-top:28px;text-align:center;padding:44px 20px"><div style="font-size:${T.H < 1000 ? 120 : 140}px;font-weight:800;line-height:1;color:${T.primary}">${esc(clip(s.stats[0]!.v, 10))}</div><div class="t" style="margin-top:14px">${esc(clip(s.stats[0]!.l, 40))}</div></div>${s.sub ? `<div class="sub" style="text-align:center">${esc(clip(s.sub, 100))}</div>` : ""}</div>`,
  },
  {
    id: "stat_grid",
    use: "2-4 numbers side by side. Only numbers found in the brand information. stats=[{v,l}], title=intro.",
    ok: (s) => s.stats.filter((x) => x.v).length >= 2,
    html: (s, T) => {
      const st = s.stats.filter((x) => x.v).slice(0, 4);
      return `<div class="body"><h2>${emph(s.title)}</h2><div style="margin-top:26px;display:grid;grid-template-columns:1fr 1fr;gap:18px">${st
        .map((x, i) => `<div class="card" style="text-align:center;padding:30px 12px;${i === 0 ? `background:${T.accent};border-color:${T.accent}` : ""}"><div style="font-size:56px;font-weight:800;line-height:1;color:${i === 0 ? T.onAccent : T.primary}">${esc(clip(x.v, 9))}</div><div class="d" style="color:${i === 0 ? T.onAccent : ""}">${esc(clip(x.l, 28))}</div></div>`)
        .join("")}</div></div>`;
    },
  },
  {
    id: "feature_cards",
    use: "2-4 benefits, features or services, each with an icon, short title and one line. items=[{t,d,i}].",
    ok: hasItems(2),
    html: (s, T) => `<div class="body"><h2>${emph(s.title)}</h2><div class="col" style="margin-top:24px">${items(s, 4)
      .map((x) => `<div class="card row" style="padding:20px 24px"><div class="ic">${icon(x.i, T.onAccent, 34)}</div><div><div class="t">${esc(clip(x.t, 34))}</div>${x.d ? `<div class="d">${esc(clip(x.d, 70))}</div>` : ""}</div></div>`)
      .join("")}</div></div>`,
  },
  {
    id: "checklist",
    use: "3-5 things included, requirements or tips, shown with ticks. items=[{t}] short phrases.",
    ok: hasItems(3),
    html: (s, T) => `<div class="body"><h2>${emph(s.title)}</h2><div class="col" style="margin-top:26px;gap:16px">${items(s, 5)
      .map((x) => `<div class="row card" style="padding:18px 24px;gap:18px"><div class="ic" style="width:50px;height:50px;border-radius:50%">${icon("check", T.onAccent, 28)}</div><div class="t" style="font-size:28px">${esc(clip(x.t, 48))}</div></div>`)
      .join("")}</div></div>`,
  },
  {
    id: "steps",
    use: "How it works: 3-4 numbered steps. items=[{t,d}] in order.",
    ok: hasItems(3),
    html: (s, T) => `<div class="body"><h2>${emph(s.title)}</h2><div class="col" style="margin-top:26px;gap:0">${items(s, 4)
      .map((x, i, a) => `<div class="row" style="align-items:flex-start;gap:22px"><div style="display:flex;flex-direction:column;align-items:center"><div class="ic" style="width:60px;height:60px;border-radius:50%;font-weight:800;font-size:28px;color:${T.onAccent}">${i + 1}</div>${i < a.length - 1 ? `<div style="width:4px;height:44px;background:${T.accent};opacity:.4;margin:4px 0"></div>` : ""}</div><div style="padding-top:6px;padding-bottom:18px"><div class="t">${esc(clip(x.t, 34))}</div>${x.d ? `<div class="d">${esc(clip(x.d, 64))}</div>` : ""}</div></div>`)
      .join("")}</div></div>`,
  },
  {
    id: "timeline",
    dark: true,
    use: "Dark roadmap with 3-4 phases or stages, current one highlighted first. items=[{t,d}].",
    ok: hasItems(3),
    html: (s, T) => `<div class="body"><h2>${emph(s.title)}</h2><div class="col" style="margin-top:26px;gap:16px">${items(s, 4)
      .map((x, i) => `<div class="card row" style="${i === 0 ? `border-color:${T.accent}` : ""}"><div class="chip ${i === 0 ? "a" : ""}" style="padding:10px 20px;font-size:22px">${i + 1}</div><div><div class="t">${esc(clip(x.t, 32))}</div>${x.d ? `<div class="d">${esc(clip(x.d, 60))}</div>` : ""}</div></div>`)
      .join("")}</div></div>`,
  },
  {
    id: "compare",
    use: "Before vs after, without vs with, old way vs our way. a=2-4 short points for the bad/old side, b=2-4 for the good/new side. title=intro; sub='Old way|New way' labels.",
    ok: (s) => s.a.filter(Boolean).length >= 1 && s.b.filter(Boolean).length >= 1,
    html: (s, T) => {
      const [la, lb] = (s.sub.includes("|") ? s.sub : "Before|After").split("|").map((x) => x.trim());
      const col = (label: string, list: string[], good: boolean) =>
        `<div class="card" style="flex:1;padding:22px 20px;${good ? `border-color:${T.accent};border-width:3px` : ""}"><div class="chip ${good ? "a" : ""}" style="padding:8px 18px;font-size:21px;margin-bottom:16px">${esc(clip(label, 14))}</div>${list
          .filter(Boolean)
          .slice(0, 4)
          .map((x) => `<div class="row" style="align-items:flex-start;gap:12px;margin-bottom:14px"><div style="flex:none;margin-top:3px">${icon(good ? "check" : "x", good ? T.primary : "#e11d48", 26)}</div><div class="d" style="margin:0;color:inherit;font-weight:700;font-size:22px">${esc(clip(x, 48))}</div></div>`)
          .join("")}</div>`;
      return `<div class="body"><h2>${emph(s.title)}</h2><div style="display:flex;gap:16px;margin-top:26px;align-items:stretch">${col(la || "Before", s.a, false)}${col(lb || "After", s.b, true)}</div></div>`;
    },
  },
  {
    id: "problem_solution",
    use: "A problem the audience feels (title) turned into your fix (sub). Two stacked cards with an arrow.",
    ok: (s) => Boolean(s.title && s.sub),
    html: (s, T) => `<div class="body"><div class="card" style="border-color:#fecdd3"><div class="row">${icon("x", "#e11d48", 40)}<div class="t" style="color:#be123c">${esc(clip(plain(s.title), 80))}</div></div></div><div style="text-align:center;margin:14px 0">${icon("arrow", T.primary, 44).replace("<svg", '<svg style="transform:rotate(90deg)"')}</div><div class="card" style="background:${T.accent};border-color:${T.accent}"><div class="row">${icon("check", T.onAccent, 40)}<div class="t" style="color:${T.onAccent}">${esc(clip(s.sub, 90))}</div></div></div></div>`,
  },
  {
    id: "phone_post",
    use: "A social post shown inside a phone. title=post headline (short), sub=caption line. Good for social, content and marketing topics.",
    ok: (s) => Boolean(s.title),
    html: (s, T) =>
      `<div class="body">${phone(`<div class="row" style="gap:10px;margin-bottom:12px"><div class="ic" style="width:42px;height:42px;border-radius:50%">${icon("user", T.onAccent, 24)}</div><div style="font-weight:800;font-size:22px">${esc(clip(T.brand, 22).toLowerCase().replace(/\s+/g, ""))}</div></div><div style="border-radius:22px;padding:34px 22px;background:linear-gradient(150deg,${T.primary},${T.secondary});color:#fff;font-weight:800;font-size:30px;line-height:1.15;min-height:260px;overflow-wrap:anywhere;word-break:break-word">${emph(s.title).replace(/<em>/g, `<span style="color:${T.accent}">`).replace(/<\/em>/g, "</span>")}</div><div class="row" style="gap:16px;margin-top:14px">${icon("heart", "#0f172a", 28)}${icon("chat", "#0f172a", 28)}${icon("arrow", "#0f172a", 28)}</div><div style="font-weight:700;font-size:20px;margin-top:10px;line-height:1.3">${esc(clip(s.sub || s.title, 90))}</div>`)}</div>`,
  },
  {
    id: "phone_chat",
    use: "A chat conversation inside a phone: items alternate customer question (t) and brand reply (d). 2-4 items. Good for support, sales, DM and service topics.",
    ok: hasItems(1),
    html: (s, T) =>
      `<div class="body">${phone(`<div style="text-align:center;font-weight:800;font-size:22px;padding-bottom:12px;border-bottom:2px solid #e2e8f0;margin-bottom:14px">${esc(clip(T.brand, 24))}</div>${items(s, 3)
        .map((x) => `<div style="background:#eef2f7;border-radius:20px 20px 20px 6px;padding:14px 18px;font-weight:700;font-size:21px;margin-bottom:10px;max-width:82%">${esc(clip(x.t, 60))}</div>${x.d ? `<div style="background:${T.accent};color:${T.onAccent};border-radius:20px 20px 6px 20px;padding:14px 18px;font-weight:700;font-size:21px;margin:0 0 14px auto;max-width:82%">${esc(clip(x.d, 70))}</div>` : ""}`)
        .join("")}`)}${s.title ? `<div class="t" style="text-align:center;margin-top:22px">${emph(s.title)}</div>` : ""}</div>`,
  },
  {
    id: "phone_notify",
    use: "Phone with 2-4 notification cards (alerts, reminders, updates, results). items=[{t,d,i}].",
    ok: hasItems(2),
    html: (s, T) =>
      `<div class="body">${phone(`<div style="text-align:center;font-weight:800;font-size:46px;margin:8px 0 18px">9:41</div>${items(s, 4)
        .map((x) => `<div class="row" style="background:#f1f5f9;border-radius:22px;padding:14px 16px;margin-bottom:12px;gap:14px"><div class="ic" style="width:46px;height:46px;border-radius:14px">${icon(x.i, T.onAccent, 26)}</div><div><div style="font-weight:800;font-size:21px">${esc(clip(x.t, 30))}</div>${x.d ? `<div style="font-weight:600;font-size:18px;color:#475569">${esc(clip(x.d, 44))}</div>` : ""}</div></div>`)
        .join("")}`)}${s.title ? `<div class="t" style="text-align:center;margin-top:22px">${emph(s.title)}</div>` : ""}</div>`,
  },
  {
    id: "offer_card",
    dark: true,
    use: "An offer or deal ticket. ONLY if the brand information states the offer. title=offer headline, sub=terms line, items=[{t}] small perks.",
    ok: (s) => Boolean(s.title),
    html: (s, T) => `<div class="body"><div class="card" style="text-align:center;padding:44px 28px;border:3px dashed ${T.accent}"><div class="chip a" style="margin-bottom:22px">${icon("tag", T.onAccent, 24)}Offer</div><h1 style="font-size:58px">${emph(s.title)}</h1>${s.sub ? `<div class="sub">${esc(clip(s.sub, 90))}</div>` : ""}<div style="display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:24px">${items(s, 4).filter((x) => x.t).map((x) => `<span class="chip" style="font-size:21px;padding:10px 18px">${esc(clip(x.t, 26))}</span>`).join("")}</div></div></div>`,
  },
  {
    id: "tags",
    use: "A cloud of 4-8 short chips: services, products, categories, who it is for. items=[{t}].",
    ok: hasItems(3),
    html: (s) => `<div class="body"><h2>${emph(s.title)}</h2><div style="display:flex;flex-wrap:wrap;gap:14px;margin-top:28px">${items(s, 8).filter((x) => x.t).map((x, i) => `<span class="chip ${i % 3 === 0 ? "a" : ""}">${esc(clip(x.t, 26))}</span>`).join("")}</div></div>`,
  },
  {
    id: "question",
    use: "A question the audience asks (title) and a direct answer (sub). Good for FAQs, myths and explainers.",
    ok: (s) => Boolean(s.title && s.sub),
    html: (s, T) => `<div class="body"><div class="card"><div class="chip a" style="margin-bottom:18px">Q</div><h2>${emph(s.title)}</h2></div><div class="card" style="margin-top:18px;background:${T.accent};border-color:${T.accent}"><div class="chip" style="margin-bottom:14px;font-size:21px">Answer</div><div class="t" style="color:${T.onAccent};font-size:32px">${esc(clip(plain(s.sub), 110))}</div></div></div>`,
  },
  {
    id: "photo_hero",
    image: "photo",
    use: "Full-screen real photo with the headline over it. img=a concrete photo idea (people, place, action; no text). Uses one image: max 2 per video.",
    ok: (s) => Boolean(s.title && s.img),
    html: (s, T) => `<div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.82) 0%,rgba(0,0,0,.35) 50%,rgba(0,0,0,.1) 100%)"></div><div class="body" style="position:relative;justify-content:flex-end;padding-bottom:30px;color:#fff"><div class="bar"></div><h1 style="color:#fff;text-shadow:0 3px 16px rgba(0,0,0,.5)">${emph(s.title)}</h1>${s.sub ? `<div class="sub" style="color:rgba(255,255,255,.85)">${esc(clip(s.sub, 100))}</div>` : ""}</div>`,
  },
  {
    id: "broll",
    image: "video",
    use: "A real stock VIDEO clip plays full-screen behind the headline. img = a concrete, common scene to search for in a stock library (for example 'shop owner at counter', 'typing on laptop', 'busy city street', 'team meeting'). Use when the message is about real people, work, shops, results or everyday life. Several allowed per video.",
    ok: (s) => Boolean(s.title && s.img),
    html: (s) => `<div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.85) 0%,rgba(0,0,0,.45) 55%,rgba(0,0,0,.3) 100%)"></div><div class="body" style="position:relative;justify-content:flex-end;padding-bottom:30px;color:#fff"><div class="bar"></div><h1 style="color:#fff;text-shadow:0 3px 16px rgba(0,0,0,.5)">${emph(s.title)}</h1>${s.sub ? `<div class="sub" style="color:rgba(255,255,255,.88)">${esc(clip(s.sub, 100))}</div>` : ""}</div>`,
  },
  {
    id: "split_photo",
    image: "photo",
    use: "Real photo in the top half, a white text card below. img=photo idea. Uses one image: max 2 per video.",
    ok: (s) => Boolean(s.title && s.img),
    html: (s, T) => `<div style="position:absolute;left:0;right:0;bottom:0;height:${Math.round(T.H * 0.5)}px;background:#fff;border-radius:40px 40px 0 0;box-shadow:0 -14px 40px rgba(15,23,42,.18)"></div><div class="body" style="position:relative;justify-content:flex-end;padding-bottom:${Math.round(T.H * 0.17)}px"><div class="bar"></div><h2 style="color:#0f172a">${emph(s.title)}</h2>${s.sub ? `<div class="sub" style="color:#475569">${esc(clip(s.sub, 90))}</div>` : ""}</div>`,
  },
  {
    id: "illustration",
    image: "art",
    use: "Headline on top and a rounded card with a flat illustration of ONE object (img = the object, e.g. 'a shopping bag'). Uses one image: max 2 per video.",
    ok: (s) => Boolean(s.title && s.img),
    html: (s, T) => `<div class="body" style="justify-content:flex-start;padding-top:${Math.round(T.H * 0.02)}px">${heading(s, "h2")}</div>`,
  },
  {
    id: "contact",
    use: "How to reach the brand: title='Get in touch' style line; items=[{t,i}] each a contact line (website, phone, WhatsApp, address) ONLY from the brand information; i is whatsapp/phone/globe/mail/pin.",
    ok: hasItems(1),
    html: (s, T) => `<div class="body"><h2>${emph(s.title)}</h2><div class="col" style="margin-top:26px">${items(s, 4).filter((x) => x.t).map((x) => `<div class="card row" style="padding:18px 22px"><div class="ic" style="width:56px;height:56px">${icon(x.i, T.onAccent, 30)}</div><div class="t" style="font-size:27px">${esc(clip(x.t, 40))}</div></div>`).join("")}</div></div>`,
  },
  {
    id: "cta_end",
    dark: true,
    use: "FINAL scene only: call to action with the brand name, a button and the website.",
    ok: () => true,
    html: (s, T) => `<div class="body" style="justify-content:center"><div class="chip" style="align-self:flex-start;margin-bottom:26px">${esc(T.brand)}</div><h1>${emph(s.title || T.cta)}</h1>${s.sub ? `<div class="sub">${esc(clip(s.sub, 100))}</div>` : ""}<div style="margin-top:40px"><span class="btn">${esc(clip(T.cta, 28))} &rarr;</span></div>${T.website ? `<div class="sub" style="margin-top:22px;font-weight:700">${esc(T.website.replace(/^https?:\/\//, "").replace(/\/$/, ""))}</div>` : ""}</div>`,
  },
];

export const LAYOUT_BY_ID = new Map(LAYOUTS.map((l) => [l.id, l]));

/** Compact catalogue text for the AI. */
export function layoutCatalogue(): string {
  return LAYOUTS.filter((l) => l.id !== "cta_end")
    .map((l) => `- ${l.id}: ${l.use}`)
    .join("\n");
}

// ---------------------------------------------------------------- caption + frame
const STOP = new Set("the and for with that this from your you are our not but have has will can get all any more most into over about than then them they their what when where which while also just only very like make made".split(" "));

/** Highlights up to two key words of the spoken line, taken from the scene headline. */
function captionHtml(voice: string, title: string) {
  const keys = new Set(
    title
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3 && !STOP.has(w)),
  );
  let used = 0;
  const words = voice.split(/\s+/).filter(Boolean);
  // words appear one after another across the estimated speaking time (about 2.4 words a second)
  const step = Math.min(0.42, Math.max(0.18, ((words.length / 2.4) * 0.9) / Math.max(1, words.length)));
  return words
    .map((w, i) => {
      const bare = w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
      const delay = (0.25 + i * step).toFixed(2);
      if (used < 2 && bare.length > 3 && keys.has(bare)) {
        used += 1;
        return `<b class="w" style="animation-delay:${delay}s">${esc(w)}</b>`;
      }
      return `<span class="w" style="animation-delay:${delay}s">${esc(w)}</span>`;
    })
    .join(" ");
}

export function renderScene(s: SceneFields, T: Theme, index: number, total: number, isLast: boolean) {
  let layout = isLast ? LAYOUT_BY_ID.get("cta_end")! : (LAYOUT_BY_ID.get(s.layout) ?? LAYOUT_BY_ID.get("hook")!);
  if (!layout.ok(s)) layout = LAYOUT_BY_ID.get("hook")!;
  const fields = layout.id === "hook" && !s.title ? { ...s, title: clip(s.voice, 60) } : s;
  const dark = Boolean(layout.dark);
  const bg = dark
    ? layout.id === "cta_end"
      ? `linear-gradient(155deg,${T.primary},${T.secondary})`
      : `linear-gradient(160deg,${T.secondary},#0b1020)`
    : "transparent";
  const prog = Array.from({ length: total }, (_, k) => `<i class="${k <= index ? "on" : ""}"></i>`).join("");
  // over a photo the strip and caption must be white
  const onPhoto = layout.id === "photo_hero" || layout.id === "broll";
  const topPhoto = layout.id === "photo_hero" || layout.id === "split_photo" || layout.id === "broll";
  const html = `<div class="f" style="background:${bg}"><div class="blob b1"></div><div class="blob b2"></div><div class="prog">${prog}</div><div class="top"${topPhoto ? ' style="color:#fff;text-shadow:0 2px 8px rgba(0,0,0,.5)"' : ""}>${T.hasLogo ? "" : esc(T.brand)}</div>${layout.html(fields, T)}<div class="cap"${onPhoto ? ' style="color:#fff"' : ""}>${captionHtml(s.voice, `${fields.title} ${fields.sub}`)}</div></div>`;
  return {
    layout,
    asset: {
      type: "html5",
      html,
      css: baseCss(T, dark),
    },
  };
}

/** The persistent light dotted background that shows under every non-dark layout. */
export function dottedBackground(T: Theme) {
  return {
    type: "html5",
    html: "<div></div>",
    css: `html,body{margin:0;padding:0;width:${W}px;height:${T.H}px;overflow:hidden}body{background-color:#f5f6fa;background-image:radial-gradient(rgba(15,23,42,.15) 2px,transparent 2.6px);background-size:30px 30px}`,
  };
}

// no "zoom": it scales the whole scene (captions included) to several times its size for a moment
export const TRANSITIONS = ["fade", "slideUp", "slideLeft", "slideUp", "fade", "slideRight"] as const;
