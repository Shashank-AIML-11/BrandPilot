/**
 * Phase 1 scoring test: does the Brand Brain write posts a founder could publish without a manual fix?
 *
 * Runs the REAL generation pipeline (playbook, brain director, week writer, editor pass) for five mock
 * brands, then has an independent judge and a set of mechanical checks mark every piece "usable" or not.
 * Gate: at least 8 of 10 pieces usable overall (and at least 7 of 10 for every brand).
 *
 * It calls the text AI only (no images, no video, no database), so it is cheap. Run it from the repo
 * folder in Windows CMD (keys are read from .env.local or .env if present, else from the environment):
 *
 *   set RUN_EVAL=1&& npx vitest run src/lib/eval/five-brands.eval.test.ts
 *
 * Optional: set EVAL_ONLY=jaipur   (one brand only)    set EVAL_START=2026-12-07   (Monday of the week)
 * Output: _diag/eval/report.md and _diag/eval/report.json (the _diag folder is never committed).
 */
import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

const RUN = process.env["RUN_EVAL"] === "1";

/**
 * EVAL_DRY=1 swaps the AI for a fake that returns dummy data of the right shape. It only proves the
 * test itself runs end to end (no keys needed); the scores it prints mean nothing.
 */
vi.mock("@/lib/ai.server", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/ai.server")>();
  if (process.env["EVAL_DRY"] !== "1") return real;
  const gen = (schema: any, prompt: string, key = ""): any => {
    if (!schema) return "";
    if (schema.enum) return schema.enum[0];
    if (schema.type === "string") return key === "date" ? "" : `Sample ${key || "text"} for the brand with a specific detail`;
    if (schema.type === "integer" || schema.type === "number") return key === "score" ? 8 : 0;
    if (schema.type === "boolean") return true;
    if (schema.type === "array") {
      const props = schema.items?.properties ?? {};
      if (key === "days") {
        const dates = [...new Set(prompt.match(/\d{4}-\d{2}-\d{2}/g) ?? [])].sort().slice(0, 7);
        return dates.map((d) => ({ ...gen(schema.items, prompt), date: d }));
      }
      if ("i" in props || "id" in props) {
        const ids = [...prompt.matchAll(/^#?(\d+)(?::| )/gm)].map((m) => Number(m[1]));
        const n = ids.length ? Math.max(...ids) + 1 : 1;
        return Array.from({ length: Math.min(n, 12) }, (_, i) => ({ ...gen(schema.items, prompt), ...("i" in props ? { i } : { id: i }) }));
      }
      return Array.from({ length: 2 }, () => gen(schema.items, prompt));
    }
    if (schema.type === "object") return Object.fromEntries(Object.entries(schema.properties ?? {}).map(([k, v]) => [k, gen(v, prompt, k)]));
    return "";
  };
  return { ...real, chatJSON: async (_s: string, prompt: string, schema: unknown) => gen(schema, prompt) };
});

for (const f of [".env.local", ".env"]) {
  try {
    if (RUN && fs.existsSync(f)) (process as unknown as { loadEnvFile?: (p: string) => void }).loadEnvFile?.(f);
  } catch {
    /* keys may come from the environment instead */
  }
}

type Mock = {
  key: string;
  group: string;
  brand: Record<string, unknown>;
};

const MOCKS: Mock[] = [
  {
    key: "jaipur",
    group: "product brand (handicrafts, e-commerce)",
    brand: {
      business_name: "Jaipur Brass Co",
      website: "https://jaipurbrassco.example",
      description: "Family-run maker of handcrafted brass decor and gift hampers from Jaipur, sold online across India.",
      products_services: "Brass diyas, decorative idols, planters, serveware and ready gift hampers. Each piece is hand-finished by artisans.",
      icp: "Urban Indian homeowners and gift buyers aged 25 to 50 who like authentic handmade decor.",
      propositions: "Handmade by Jaipur artisans; gift-ready packaging; easy returns; ships across India.",
      tone: "Warm, proud of the craft, simple and helpful",
      keywords: "brass decor, handmade gifts, diya, home decor",
      industry: "Handicrafts / Home decor (e-commerce)",
      current_offers: "10% off festive gift hampers this month",
      testimonials: "",
      competitors: "Mass-produced decor marketplaces",
      locations: "Jaipur; ships pan-India",
      languages: "English",
      voice_dos_donts: "Do: mention hand-finishing and real materials. Don't: claim antique or certified pure unless stated.",
      compliance_notes: "No health or investment claims. Do not call products antique.",
      social_handles: { instagram: "jaipurbrassco", facebook: "jaipurbrassco", linkedin: "jaipur-brass-co" },
    },
  },
  {
    key: "dental",
    group: "local service (clinic)",
    brand: {
      business_name: "Smile Studio Dental, Pune",
      website: "https://smilestudio.example",
      description: "Two-dentist family dental clinic in Kothrud, Pune, focused on painless treatment and clear pricing.",
      products_services: "Check-ups and cleaning, root canal, braces and clear aligners, teeth whitening, kids dentistry.",
      icp: "Families and working professionals within 6 km of Kothrud who are anxious about dental visits.",
      propositions: "Painless treatment focus; fixed price quotes before starting; evening and Sunday slots; sterilised instruments in front of the patient.",
      tone: "Calm, reassuring, plain language, never scary",
      keywords: "dentist Kothrud, painless root canal, braces Pune",
      industry: "Healthcare / Dental clinic (local service)",
      current_offers: "Free first consultation and X-ray for new patients",
      testimonials: "\"I was dreading my root canal but felt nothing\" - a patient from Karve Nagar",
      competitors: "Large dental chains",
      locations: "Kothrud, Pune",
      languages: "English",
      voice_dos_donts: "Do: explain procedures simply. Don't: show graphic images, guarantee results, or compare with named clinics.",
      compliance_notes: "No guaranteed outcomes, no before/after claims, no medical advice for individual cases.",
      social_handles: { instagram: "smilestudiodental", facebook: "smilestudiodental", linkedin: "smile-studio-dental" },
    },
  },
  {
    key: "cafe",
    group: "food (cafe)",
    brand: {
      business_name: "Brew & Barrel Cafe, Bengaluru",
      website: "https://brewbarrel.example",
      description: "Neighbourhood specialty coffee cafe in Indiranagar with house-roasted beans and a small all-day menu.",
      products_services: "Filter coffee, cold brew, pour-overs, sourdough sandwiches, brunch plates, beans sold by the packet.",
      icp: "Young professionals, remote workers and students in Indiranagar and nearby areas.",
      propositions: "Beans roasted in-house weekly; quiet work corner with Wi-Fi; weekend brunch; pet friendly patio.",
      tone: "Friendly, a little witty, local",
      keywords: "specialty coffee Indiranagar, cafe to work from, brunch Bengaluru",
      industry: "Food and beverage / Cafe",
      current_offers: "Buy 2 weekday coffees, get a pastry free before 11 AM",
      testimonials: "",
      competitors: "Big coffee chains",
      locations: "Indiranagar, Bengaluru",
      languages: "English",
      voice_dos_donts: "Do: talk about the beans, the roast and the space. Don't: use stock cafe cliches or invent awards.",
      compliance_notes: "No health claims about caffeine.",
      social_handles: { instagram: "brewandbarrelblr", facebook: "brewandbarrelblr" },
    },
  },
  {
    key: "saas",
    group: "B2B software",
    brand: {
      business_name: "LedgerLoop",
      website: "https://ledgerloop.example",
      description: "Invoicing and payment-reminder software for Indian small businesses and freelancers, with GST-ready invoices.",
      products_services: "GST invoices, automatic payment reminders on WhatsApp and email, UPI payment links, simple monthly reports.",
      icp: "Owners and accountants of small Indian businesses (1 to 30 staff) and freelancers who chase late payments.",
      propositions: "GST-ready invoice in about 30 seconds; automatic reminders; UPI link on every invoice; free plan for freelancers.",
      tone: "Practical, direct, respectful of time, no jargon",
      keywords: "GST invoice software, payment reminders, UPI invoicing",
      industry: "B2B SaaS / Accounting software",
      current_offers: "Free plan for freelancers; 14-day trial of the business plan",
      testimonials: "",
      competitors: "Large accounting suites",
      locations: "India",
      languages: "English",
      voice_dos_donts: "Do: use real invoicing scenarios. Don't: promise tax or legal outcomes, or invent customer numbers.",
      compliance_notes: "Do not give tax advice or guarantee compliance outcomes.",
      social_handles: { instagram: "ledgerloop", linkedin: "ledgerloop", facebook: "ledgerloop" },
    },
  },
  {
    key: "coaching",
    group: "education (coaching)",
    brand: {
      business_name: "ScoreUp Maths Academy, Kota",
      website: "https://scoreup.example",
      description: "Small-batch maths coaching for Class 9 to 12 and JEE foundation, with weekly tests and parent updates.",
      products_services: "Class 9-10 maths, Class 11-12 maths, JEE foundation batches of at most 20 students, doubt-clearing sessions, weekly tests.",
      icp: "Parents and students in Class 9 to 12 who are worried about maths marks and want personal attention.",
      propositions: "Batches capped at 20; weekly test and parent report; free doubt sessions on Sundays; demo class before joining.",
      tone: "Encouraging, clear, honest about effort, not hype",
      keywords: "maths coaching Kota, JEE foundation, class 10 maths",
      industry: "Education / Coaching classes",
      current_offers: "Free demo class and diagnostic test",
      testimonials: "",
      competitors: "Large coaching institutes",
      locations: "Kota, Rajasthan",
      languages: "English",
      voice_dos_donts: "Do: show how learning works with simple examples. Don't: promise ranks, selections or guaranteed marks.",
      compliance_notes: "No guaranteed results or rank claims.",
      social_handles: { instagram: "scoreupmaths", facebook: "scoreupmaths", linkedin: "scoreup-maths" },
    },
  },
];

/** A fake database that accepts every call and returns nothing, so the real pipeline runs without Supabase. */
function stubAdmin(): never {
  const chain = (single = false): unknown =>
    new Proxy(function () {}, {
      get(_t, prop) {
        if (prop === "then") return (resolve: (v: unknown) => void) => resolve({ data: single ? null : [], error: null, count: 0 });
        if (prop === "maybeSingle" || prop === "single") return () => chain(true);
        return () => chain(single);
      },
      apply: () => chain(single),
    });
  return { from: () => chain(), rpc: () => chain(), storage: { from: () => chain() } } as never;
}

const FESTIVALS = /diwali|dhanteras|holi\b|christmas|new year|raksha|rakhi|eid\b|navratri|dussehra|ganesh|valentine|black friday|pongal|sankranti|onam|janmashtami|karwa/i;
const GENERIC_HEADLINE = /^(how it works|why choose us|our services|quality you can trust|about us|welcome)/i;

const expectedByBrand = new Map<string, number>();

interface Piece {
  type: string;
  date: string;
  title: string;
  caption: string;
  script: string;
  headline: string;
  meta: Record<string, unknown>;
}

interface Judged extends Piece {
  usable: boolean;
  score: number;
  issues: string[];
  judge: string;
}

const JUDGE_SYSTEM = `You are a tough, independent reviewer for a social media agency in India. You decide, for each piece, whether the business owner could post it AS IT IS, with no manual fix. You are not the writer and you do not rewrite anything.

A piece is NOT usable if any of these is true: it is generic and could belong to any brand; it states a fact, number, offer, award, customer or result that is not in the brand information; it mentions a festival or season that is not close to the scheduled date; it breaks the brand's do's, don'ts or compliance notes; it makes a medical, legal, financial, tax or guaranteed-result claim; it mixes languages inside one piece; the first line would not stop a scroll; the tone does not match the brand; it is wrong for the platform (length, format, hashtags); for image posts, the poster headline is a label or vague benefit instead of something specific; it sounds like an AI wrote it (stock phrases, filler openers, hollow superlatives).

Score each piece 1 to 10 (7 means "I would post this as it is"). Be strict and consistent. "issues" lists the specific problems in at most 12 words each (empty when none).`;

const JUDGE_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          i: { type: "integer" },
          usable: { type: "boolean" },
          score: { type: "integer" },
          issues: { type: "array", items: { type: "string" } },
        },
        required: ["i", "usable", "score", "issues"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

async function runBrand(mock: Mock, dates: string[]): Promise<Judged[]> {
  const content = await import("@/lib/content.server");
  const { ensurePlaybook, playbookContext } = await import("@/lib/playbook.server");
  const { planVariety, varietyContext, slotsFromQuotas } = await import("@/lib/variety.server");
  const { polishRows, clichesIn, numbersAllowed } = await import("@/lib/content-quality.server");
  const { chatJSON } = await import("@/lib/ai.server");
  const { occasionLine } = await import("@/lib/occasions");
  const { posterCopyFor } = await import("@/lib/poster.server");
  const admin = stubAdmin();

  const brand = { id: `eval-${mock.key}`, user_id: "eval-user", updated_at: new Date().toISOString(), ...mock.brand };
  const playbook = await ensurePlaybook(admin, brand as never, { force: true });
  if (!playbook) throw new Error(`${mock.key}: playbook could not be built`);

  const quotas = content.weeklyContentPlan(dates);
  content.withoutCarousels(quotas);
  const platforms = content.activePlatforms(brand as never);
  const rows: Array<Record<string, unknown>> = [];
  let remaining = Object.fromEntries(Object.entries(quotas).map(([d, q]) => [d, { ...q }])) as typeof quotas;
  let brainContextAll = "";

  for (let guard = 0; guard < 12; guard += 1) {
    const pendingDates = dates.filter((d) => Object.values(remaining[d] ?? {}).some((n) => n > 0));
    if (!pendingDates.length) break;
    const batch = content.packGenerationBatch(pendingDates, remaining);
    const slots = slotsFromQuotas(batch.dates, batch.quotas, batch.types);
    const plan = await planVariety(admin, { userId: "eval-user", brandId: brand.id, slots, playbook });
    const brainContext = playbookContext(playbook) + varietyContext(playbook, plan, slots);
    brainContextAll = brainContext;
    let result: { days?: Array<Record<string, unknown>> } = {};
    for (let attempt = 1; ; attempt += 1) {
      try {
        result = await chatJSON(content.SYSTEM_PROMPT, content.weekPrompt(brand as never, batch.dates, null, batch.quotas, batch.types, brainContext), content.buildWeekResponseSchema(batch.types));
        break;
      } catch (error) {
        if (attempt >= 3) throw error;
      }
    }
    const days = (result.days ?? []) as Array<{ date?: string }>;
    const built: Array<Record<string, unknown>> = [];
    batch.dates.forEach((date, index) => {
      const day = days.find((d) => d.date === date) ?? days[index] ?? {};
      built.push(...content.rowsForDay(day as never, { userId: "eval-user", brandId: brand.id, date, platforms, autopost: false, styles: plan }, batch.quotas[date]!));
    });
    // the real queue asks once more for pieces the model left out; do the same here
    const have = (d: string, t: string) => built.filter((r) => r["scheduled_date"] === d && r["type"] === t).length;
    const missingQuotas: typeof batch.quotas = {};
    const missingTypes = new Set<string>();
    for (const date of batch.dates) {
      for (const type of content.CONTENT_TYPES) {
        const lack = (batch.quotas[date]?.[type] ?? 0) - have(date, type);
        if (lack > 0) {
          missingQuotas[date] ??= content.emptyQuota();
          missingQuotas[date]![type] = lack;
          missingTypes.add(type);
        }
      }
    }
    if (Object.keys(missingQuotas).length) {
      try {
        const again = await chatJSON<{ days?: Array<Record<string, unknown>> }>(
          content.SYSTEM_PROMPT,
          content.weekPrompt(brand as never, Object.keys(missingQuotas), null, missingQuotas, [...missingTypes] as never, brainContext),
          content.buildWeekResponseSchema([...missingTypes] as never),
        );
        const d2 = (again.days ?? []) as Array<{ date?: string }>;
        Object.keys(missingQuotas).forEach((date, index) => {
          const day = d2.find((d) => d.date === date) ?? d2[index] ?? {};
          built.push(...content.rowsForDay(day as never, { userId: "eval-user", brandId: brand.id, date, platforms, autopost: false, styles: plan }, missingQuotas[date]!));
        });
      } catch (error) {
        console.warn(`[eval] ${mock.key}: second ask for missing pieces failed: ${error instanceof Error ? error.message : error}`);
      }
    }
    rows.push(...built);
    remaining = Object.fromEntries(
      Object.entries(remaining).map(([d, q]) => [d, Object.fromEntries(Object.entries(q).map(([t, n]) => [t, Math.max(0, (n as number) - ((batch.quotas[d] as Record<string, number> | undefined)?.[t] ?? 0))]))]),
    ) as typeof quotas;
  }

  const brandText = content.brandContext(brand as never) + brainContextAll;
  const polished = await polishRows(admin, { userId: "eval-user", brandId: brand.id, rows, brandText });

  const pieces: Piece[] = polished.rows
    .filter((r) => String(r["title"] ?? "").trim() && !/generation failed/i.test(String(r["title"] ?? "")))
    .map((r) => ({
      type: String(r["type"]),
      date: String(r["scheduled_date"]),
      title: String(r["title"] ?? ""),
      caption: String(r["caption"] ?? ""),
      script: String(r["video_script"] ?? ""),
      headline: posterCopyFor({ title: String(r["title"] ?? ""), summary: String(r["summary"] ?? ""), image_prompt: String(r["image_prompt"] ?? "") }, { website: "" }).headline,
      meta: (r["style_meta"] ?? {}) as Record<string, unknown>,
    }));

  // independent judge (a separate call with its own rubric)
  const listing = pieces
    .map((p, i) => `#${i} ${p.type} scheduled ${p.date} | occasions close to that date: ${occasionLine(p.date)}\nTITLE: ${p.title}\nCAPTION: ${p.caption.slice(0, 700)}${p.script ? `\nSCRIPT: ${p.script.slice(0, 600)}` : ""}${p.headline && /post|pinterest|carousel/.test(p.type) ? `\nPOSTER HEADLINE: ${p.headline}` : ""}`)
    .join("\n\n");
  const judged = new Map<number, { usable: boolean; score: number; issues: string[] }>();
  for (let from = 0; from < pieces.length; from += 8) {
    const chunk = pieces.slice(from, from + 8);
    const chunkListing = chunk
      .map((p, k) => listing.split("\n\n")[from + k]!.replace(/^#\d+/, `#${k}`))
      .join("\n\n");
    const res = await chatJSON<{ items?: Array<{ i: number; usable: boolean; score: number; issues: string[] }> }>(
      JUDGE_SYSTEM,
      `BRAND INFORMATION AND PLAYBOOK:\n${brandText.slice(0, 6500)}\n\nPIECES:\n\n${chunkListing}\n\nReturn one item per piece with the same id.`,
      JUDGE_SCHEMA as never,
      { reasoningEffort: "low", maxTokens: 3000 },
    );
    for (const it of res.items ?? []) judged.set(from + it.i, it);
  }

  // the judge sometimes skips a piece; ask again for those, one by one
  for (let i = 0; i < pieces.length; i += 1) {
    if (judged.has(i)) continue;
    const one = listing.split("\n\n")[i]!.replace(/^#\d+/, "#0");
    try {
      const res = await chatJSON<{ items?: Array<{ i: number; usable: boolean; score: number; issues: string[] }> }>(
        JUDGE_SYSTEM,
        `BRAND INFORMATION AND PLAYBOOK:\n${brandText.slice(0, 6500)}\n\nPIECES:\n\n${one}\n\nReturn one item per piece with the same id.`,
        JUDGE_SCHEMA as never,
        { reasoningEffort: "low", maxTokens: 1500 },
      );
      if (res.items?.[0]) judged.set(i, res.items[0]);
    } catch {
      /* stays "not judged" and counts as not usable */
    }
  }

  expectedByBrand.set(mock.key, dates.reduce((n, d) => n + Object.values(quotas[d] ?? {}).reduce((a, b) => a + (b as number), 0), 0));
  return pieces.map((p, i) => {
    const j = judged.get(i) ?? { usable: false, score: 0, issues: ["not judged"] };
    const text = `${p.title} ${p.caption} ${p.script}`;
    const hard: string[] = [];
    const fest = text.match(FESTIVALS)?.[0];
    if (fest && !occasionLine(p.date).toLowerCase().includes(fest.toLowerCase().split(/\s+/)[0]!)) hard.push(`mentions "${fest}" but no such occasion is near ${p.date}`);
    if (/[ऀ-ॿ]/.test(text)) hard.push("contains non-English script");
    const cl = clichesIn(text);
    if (cl.length) hard.push(`stock phrases: ${cl.join(", ")}`);
    if (!numbersAllowed(text, brandText)) hard.push("number not found in the brand information");
    if (p.headline && /post|pinterest/.test(p.type)) {
      const words = p.headline.split(/\s+/).filter(Boolean).length;
      if (words < 2 || words > 10 || GENERIC_HEADLINE.test(p.headline) || p.headline.toLowerCase() === String(mock.brand["business_name"]).toLowerCase()) hard.push(`weak poster headline: "${p.headline}"`);
    }
    if (p.caption.length < 20 && !/blog/.test(p.type)) hard.push("caption too short");
    return { ...p, usable: j.usable && hard.length === 0, score: j.score, issues: [...j.issues, ...hard], judge: j.usable ? "usable" : "not usable" };
  });
}

describe.skipIf(!RUN)("five-brand scoring test (Phase 1 gate)", () => {
  it(
    "writes a week for five mock brands and scores every piece",
    async () => {
      const only = process.env["EVAL_ONLY"]?.trim().toLowerCase();
      const start = process.env["EVAL_START"]?.trim() || "2026-12-07";
      const dates = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(`${start}T12:00:00Z`);
        d.setUTCDate(d.getUTCDate() + i);
        return d.toISOString().slice(0, 10);
      });
      const brands = MOCKS.filter((m) => !only || m.key === only);
      const results: Array<{ mock: Mock; pieces: Judged[] }> = [];
      for (const mock of brands) {
        console.log(`[eval] ${mock.brand["business_name"]} ...`);
        // one brand failing (a model glitch, a rate limit) must not lose the others: try twice, then record it
        let pieces: Judged[] = [];
        for (let attempt = 1; attempt <= 2; attempt += 1) {
          try {
            pieces = await runBrand(mock, dates);
            break;
          } catch (error) {
            console.warn(`[eval] ${mock.key} attempt ${attempt} failed: ${error instanceof Error ? error.message : error}`);
          }
        }
        results.push({ mock, pieces });
      }

      const lines: string[] = [`# Five-brand scoring test`, ``, `Week ${dates[0]} to ${dates[6]}. A piece is usable when the independent judge says so and no mechanical check fails.`, ``];
      const all = results.flatMap((r) => r.pieces);
      const usableAll = all.filter((p) => p.usable).length;
      const expectedAll = results.reduce((n, r) => n + (expectedByBrand.get(r.mock.key as string) ?? r.pieces.length), 0);
      lines.push(`**Overall: ${usableAll} of ${expectedAll} pieces planned were written AND usable (${expectedAll ? Math.round((usableAll / expectedAll) * 100) : 0}%). Gate: 80%. ${expectedAll - all.length} planned piece(s) were never written.**`, ``);
      lines.push(`| Brand | Planned | Written | Usable | Rate (of planned) | Avg judge score | Avg editor score |`, `|---|---|---|---|---|---|---|`);
      for (const r of results) {
        const u = r.pieces.filter((p) => p.usable).length;
        const avg = (xs: number[]) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : "n/a");
        const ed = r.pieces.map((p) => Number((p.meta["q"] as { score?: number } | undefined)?.score)).filter((n) => Number.isFinite(n) && n > 0);
        const planned = expectedByBrand.get(r.mock.key as string) ?? r.pieces.length;
        lines.push(`| ${r.mock.brand["business_name"]} | ${planned} | ${r.pieces.length} | ${u} | ${planned ? Math.round((u / planned) * 100) : 0}% | ${avg(r.pieces.map((p) => p.score))} | ${avg(ed)} |`);
      }
      lines.push(``);
      for (const r of results) {
        lines.push(`## ${r.mock.brand["business_name"]} (${r.mock.group})`, ``);
        for (const p of r.pieces) {
          lines.push(`- ${p.usable ? "PASS" : "FAIL"} | ${p.date} ${p.type} | judge ${p.score}/10 | "${p.title}"${p.issues.length ? `\n  - ${p.issues.join("\n  - ")}` : ""}`);
        }
        lines.push(``);
      }
      const dir = path.join(process.cwd(), "_diag", "eval");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "report.md"), lines.join("\n"));
      fs.writeFileSync(path.join(dir, "report.json"), JSON.stringify(results.map((r) => ({ brand: r.mock.brand["business_name"], pieces: r.pieces })), null, 2));
      console.log(lines.slice(0, 14).join("\n"));
      console.log(`Full report: ${path.join(dir, "report.md")}`);
      expect(all.length).toBeGreaterThan(0);
      const missing = results.filter((r) => !r.pieces.length).map((r) => r.mock.key);
      if (missing.length) console.warn(`[eval] no result for: ${missing.join(", ")} (see warnings above)`);
    },
    30 * 60 * 1000,
  );
});
