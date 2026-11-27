/**
 * Website scanner for the Brand Profile. Server-only.
 *
 * Fetches a brand's public website (home page plus up to three useful inner pages such as
 * About or Products), and pulls out plain text, meta tags, structured data and social links.
 * The AI step that turns this into Brand Profile fields lives in brand-knowledge.server.ts.
 *
 * Safety: the address is user supplied, so every hop (including redirects) is checked to be a
 * public http(s) host. Private, loopback, link-local and cloud-metadata addresses are refused.
 * Known limit: the DNS check and the connection are two separate lookups, so a hostile DNS
 * server that changes its answer between them is not fully covered.
 */
import { lookup } from "node:dns/promises";
import net from "node:net";

export interface ScannedPage {
  url: string;
  title: string;
  text: string;
}

export interface SiteScan {
  siteUrl: string;
  pages: ScannedPage[];
  meta: {
    title: string;
    description: string;
    siteName: string;
    language: string;
    themeColor: string;
  };
  headings: string[];
  structured: { names: string[]; descriptions: string[]; addresses: string[] };
  social: Record<string, string>;
}

const MAX_PAGE_BYTES = 1_500_000;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 4;
const USER_AGENT = "LOVIZA-BrandScanner/1.0 (+https://loviza.click)";

/** True for any address a public website should never resolve to. */
export function isBlockedAddress(address: string): boolean {
  const ip = address.trim().toLowerCase();
  if (net.isIPv4(ip)) {
    const [a = 0, b = 0] = ip.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local and cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
    if (a === 192 && b === 0) return true;
    if (a === 198 && (b === 18 || b === 19)) return true;
    if (a >= 224) return true; // multicast and reserved
    return false;
  }
  if (net.isIPv6(ip)) {
    if (ip === "::" || ip === "::1") return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
    if (mapped) return isBlockedAddress(mapped[1]!);
    if (/^f[cd]/.test(ip)) return true; // unique local fc00::/7
    if (/^fe[89ab]/.test(ip)) return true; // link-local fe80::/10
    if (ip.startsWith("ff")) return true;
    return false;
  }
  return true; // not an IP at all: refuse
}

/** Accepts "acme.com" or a full address; returns a clean http(s) URL or throws a plain message. */
export function normaliseSiteUrl(input: string): URL {
  const raw = String(input ?? "").trim();
  if (!raw) throw new Error("Enter your website address first.");
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new Error("That does not look like a website address.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only http and https websites can be scanned.");
  if (url.username || url.password) throw new Error("Remove the login details from the address.");
  if (!url.hostname.includes(".") && !net.isIP(url.hostname)) throw new Error("That does not look like a website address.");
  url.hash = "";
  return url;
}

async function assertPublicHost(hostname: string): Promise<void> {
  const host = hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host)) {
    if (isBlockedAddress(host)) throw new Error("That address is not a public website.");
    return;
  }
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    throw new Error("That address is not a public website.");
  }
  let records: Array<{ address: string }>;
  try {
    records = await lookup(host, { all: true });
  } catch {
    throw new Error("Could not find that website. Check the address.");
  }
  if (!records.length || records.some((r) => isBlockedAddress(r.address))) {
    throw new Error("That address is not a public website.");
  }
}

async function readLimited(res: Response, max: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return (await res.text()).slice(0, max);
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    chunks.push(value);
    if (total >= max) {
      await reader.cancel().catch(() => undefined);
      break;
    }
  }
  const all = new Uint8Array(Math.min(total, max));
  let offset = 0;
  for (const c of chunks) {
    const room = all.length - offset;
    if (room <= 0) break;
    all.set(c.byteLength > room ? c.subarray(0, room) : c, offset);
    offset += Math.min(c.byteLength, room);
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(all);
}

/** Fetches one HTML page, following at most a few redirects and re-checking every host. */
export async function fetchPage(start: URL): Promise<{ url: string; html: string }> {
  let current = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    await assertPublicHost(current.hostname);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(current, {
        redirect: "manual",
        signal: controller.signal,
        headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
      });
    } catch {
      throw new Error("The website did not respond in time. Try again, or fill the profile by hand.");
    } finally {
      clearTimeout(timer);
    }
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new Error("The website redirected without saying where.");
      const next = new URL(location, current);
      if (next.protocol !== "http:" && next.protocol !== "https:") throw new Error("The website redirected somewhere unsupported.");
      current = next;
      continue;
    }
    if (!res.ok) throw new Error(`The website answered with an error (${res.status}).`);
    const type = (res.headers.get("content-type") ?? "").toLowerCase();
    if (type && !type.includes("html") && !type.includes("xml")) throw new Error("That address is not a web page.");
    return { url: current.toString(), html: await readLimited(res, MAX_PAGE_BYTES) };
  }
  throw new Error("The website redirected too many times.");
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', ndash: "-", mdash: "-", hellip: "...", copy: "(c)", reg: "(R)", trade: "(TM)" };

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => safeChar(Number.parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => safeChar(Number.parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n: string) => ENTITIES[n.toLowerCase()] ?? m);
}

function safeChar(code: number): string {
  if (!Number.isFinite(code) || code < 32 || code > 0x10ffff) return " ";
  try {
    return String.fromCodePoint(code);
  } catch {
    return " ";
  }
}

const clean = (s: string) => decodeEntities(s).replace(/\s+/g, " ").trim();

/** Readable text of an HTML page: scripts, styles and markup removed, blocks kept apart. */
export function htmlToText(html: string): string {
  const stripped = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|iframe|template|canvas)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article|\/header|\/footer|\/ul|\/ol)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(stripped)
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 1)
    .join("\n");
}

function metaContent(html: string, key: string): string {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const name = /(?:name|property)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    if (name !== key) continue;
    const content = /content\s*=\s*"([^"]*)"|content\s*=\s*'([^']*)'/i.exec(tag);
    const value = content?.[1] ?? content?.[2] ?? "";
    if (value) return clean(value);
  }
  return "";
}

export function pageTitle(html: string): string {
  const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  return t ? clean(t) : "";
}

export function headingsOf(html: string, max = 14): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi)) {
    const text = clean((m[2] ?? "").replace(/<[^>]+>/g, " "));
    if (text.length > 2 && text.length < 160 && !out.includes(text)) out.push(text);
    if (out.length >= max) break;
  }
  return out;
}

type Json = Record<string, unknown>;

function flattenLd(node: unknown, out: Json[]): void {
  if (Array.isArray(node)) return node.forEach((n) => flattenLd(n, out));
  if (node && typeof node === "object") {
    out.push(node as Json);
    const graph = (node as Json)["@graph"];
    if (graph) flattenLd(graph, out);
  }
}

export function structuredData(html: string): SiteScan["structured"] & { sameAs: string[] } {
  const nodes: Json[] = [];
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      flattenLd(JSON.parse((m[1] ?? "").trim()), nodes);
    } catch {
      /* ignore malformed structured data */
    }
  }
  const names: string[] = [];
  const descriptions: string[] = [];
  const addresses: string[] = [];
  const sameAs: string[] = [];
  for (const n of nodes) {
    const type = String(Array.isArray(n["@type"]) ? (n["@type"] as unknown[]).join(",") : (n["@type"] ?? ""));
    if (!/organization|business|store|product|service|restaurant|corporation|website/i.test(type)) continue;
    if (typeof n["name"] === "string") names.push(clean(n["name"]));
    if (typeof n["description"] === "string") descriptions.push(clean(n["description"]).slice(0, 400));
    const addr = n["address"] as Json | undefined;
    if (addr && typeof addr === "object") {
      const line = [addr["addressLocality"], addr["addressRegion"], addr["addressCountry"]].filter((x) => typeof x === "string" && x).join(", ");
      if (line) addresses.push(line);
    }
    const same = n["sameAs"];
    for (const s of Array.isArray(same) ? same : same ? [same] : []) if (typeof s === "string") sameAs.push(s);
  }
  const uniq = (a: string[]) => [...new Set(a.filter(Boolean))].slice(0, 6);
  return { names: uniq(names), descriptions: uniq(descriptions), addresses: uniq(addresses), sameAs: uniq(sameAs) };
}

const SOCIAL_HOSTS: Array<{ key: string; hosts: string[]; style: "at" | "path" }> = [
  { key: "Instagram", hosts: ["instagram.com"], style: "at" },
  { key: "X", hosts: ["x.com", "twitter.com"], style: "at" },
  { key: "TikTok", hosts: ["tiktok.com"], style: "at" },
  { key: "Threads", hosts: ["threads.net", "threads.com"], style: "at" },
  { key: "LinkedIn", hosts: ["linkedin.com"], style: "path" },
  { key: "Facebook", hosts: ["facebook.com", "fb.com"], style: "path" },
  { key: "YouTube", hosts: ["youtube.com"], style: "path" },
  { key: "Pinterest", hosts: ["pinterest.com"], style: "path" },
  { key: "Medium", hosts: ["medium.com"], style: "path" },
  { key: "Quora", hosts: ["quora.com"], style: "path" },
];

const SHARE_PATH = /(share|sharer|intent|dialog|login|signup|plugins|hashtag|explore|reel|\/p\/|watch\?)/i;

/** Social profile links found on a page, in the shape the Brand Profile stores them. */
export function socialLinks(urls: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of urls) {
    let u: URL;
    try {
      u = new URL(raw);
    } catch {
      continue;
    }
    const host = u.hostname.replace(/^www\./, "");
    const rule = SOCIAL_HOSTS.find((s) => s.hosts.some((h) => host === h || host.endsWith(`.${h}`)));
    if (!rule || out[rule.key]) continue;
    const path = u.pathname.replace(/\/+$/, "");
    if (!path || path === "/" || SHARE_PATH.test(`${path}${u.search}`)) continue;
    if (rule.style === "at") {
      const handle = path.split("/")[1]?.replace(/^@/, "");
      if (handle && /^[\w.]{2,40}$/.test(handle)) out[rule.key] = `@${handle}`;
    } else {
      out[rule.key] = `${rule.hosts[0]}${path}`.slice(0, 200);
    }
  }
  return out;
}

export function linksOf(html: string, base: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    const href = (m[1] ?? m[2] ?? "").trim();
    if (!href || href.startsWith("#") || /^(mailto|tel|javascript):/i.test(href)) continue;
    try {
      out.push(new URL(href, base).toString());
    } catch {
      /* skip */
    }
  }
  return out;
}

const PAGE_RULES: Array<{ re: RegExp; weight: number }> = [
  { re: /about|who-we-are|our-story|company|story/i, weight: 5 },
  { re: /product|shop|collection|catalog|menu|range|store/i, weight: 4 },
  { re: /service|solution|offering|treatment|course|program|plans?|pricing|features?/i, weight: 4 },
  { re: /testimonial|review|case-stud|customers?|work|portfolio/i, weight: 2 },
];

/** Picks up to `max` same-site inner pages most likely to describe the business. */
export function pickInnerPages(links: string[], home: URL, max = 3): URL[] {
  const scored = new Map<string, { url: URL; score: number }>();
  for (const l of links) {
    let u: URL;
    try {
      u = new URL(l);
    } catch {
      continue;
    }
    if (u.hostname.replace(/^www\./, "") !== home.hostname.replace(/^www\./, "")) continue;
    u.hash = "";
    u.search = "";
    const path = u.pathname.toLowerCase();
    if (path === "/" || path === "" || /\.(pdf|jpe?g|png|gif|webp|svg|zip|mp4)$/.test(path)) continue;
    if (/(login|signin|signup|cart|checkout|account|privacy|terms|policy|cookie|blog\/|tag\/|category\/)/.test(path)) continue;
    if (path.split("/").filter(Boolean).length > 2) continue;
    const score = PAGE_RULES.reduce((s, r) => (r.re.test(path) ? Math.max(s, r.weight) : s), 0);
    if (!score) continue;
    const key = u.toString();
    if (!scored.has(key)) scored.set(key, { url: u, score });
  }
  return [...scored.values()].sort((a, b) => b.score - a.score).slice(0, max).map((x) => x.url);
}

const hexColor = (v: string) => (/^#[0-9a-f]{6}$/i.test(v.trim()) ? v.trim().toLowerCase() : "");

/** Fetches the site and gathers everything the AI step needs. */
export async function scanWebsite(input: string): Promise<SiteScan> {
  const start = normaliseSiteUrl(input);
  const home = await fetchPage(start);
  const homeUrl = new URL(home.url);
  const links = linksOf(home.html, home.url);
  const ld = structuredData(home.html);

  const pages: ScannedPage[] = [
    { url: home.url, title: pageTitle(home.html), text: htmlToText(home.html).slice(0, 7000) },
  ];
  const inner = pickInnerPages(links, homeUrl, 3);
  const results = await Promise.allSettled(inner.map((u) => fetchPage(u)));
  results.forEach((r) => {
    if (r.status !== "fulfilled") return;
    const text = htmlToText(r.value.html).slice(0, 3500);
    if (text.length > 80) pages.push({ url: r.value.url, title: pageTitle(r.value.html), text });
  });

  return {
    siteUrl: home.url,
    pages,
    meta: {
      title: pageTitle(home.html),
      description: metaContent(home.html, "description") || metaContent(home.html, "og:description"),
      siteName: metaContent(home.html, "og:site_name"),
      language: /<html\b[^>]*\blang\s*=\s*["']([^"']+)["']/i.exec(home.html)?.[1] ?? "",
      themeColor: hexColor(metaContent(home.html, "theme-color")),
    },
    headings: headingsOf(home.html),
    structured: { names: ld.names, descriptions: ld.descriptions, addresses: ld.addresses },
    social: socialLinks([...links, ...ld.sameAs]),
  };
}

/** The scan as one compact block of text for the model (capped so prompts stay small). */
export function scanToPrompt(scan: SiteScan, maxChars = 14_000): string {
  const parts: string[] = [
    `Website: ${scan.siteUrl}`,
    scan.meta.title && `Page title: ${scan.meta.title}`,
    scan.meta.siteName && `Site name: ${scan.meta.siteName}`,
    scan.meta.description && `Meta description: ${scan.meta.description}`,
    scan.meta.language && `Page language: ${scan.meta.language}`,
    scan.structured.names.length && `Names in structured data: ${scan.structured.names.join(" | ")}`,
    scan.structured.descriptions.length && `Descriptions in structured data: ${scan.structured.descriptions.join(" | ")}`,
    scan.structured.addresses.length && `Addresses in structured data: ${scan.structured.addresses.join(" | ")}`,
    scan.headings.length && `Headings: ${scan.headings.join(" | ")}`,
  ].filter(Boolean) as string[];
  for (const p of scan.pages) parts.push(`\n--- PAGE ${p.url} ---\n${p.text}`);
  return parts.join("\n").slice(0, maxChars);
}
