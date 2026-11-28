import { describe, expect, it } from "vitest";
import { clichesIn, numbersAllowed, plainDashes, ruleFindings, similarity } from "@/lib/content-quality.server";
import { ANGLE_BANK, HOOK_STYLES, planVariety, slotsFromQuotas } from "@/lib/variety.server";

describe("AI-sounding phrases", () => {
  it("spots stock phrases and ignores plain writing", () => {
    expect(clichesIn("Unlock your brand's potential and elevate your feed")).not.toHaveLength(0);
    expect(clichesIn("In today's fast-paced world, you need a game-changer")).not.toHaveLength(0);
    expect(clichesIn("Our brass diyas are hand-cast in Jaipur and ship in 3 days")).toHaveLength(0);
  });
  it("replaces spaced long dashes with commas", () => {
    expect(plainDashes("Fresh bread — baked at 5am – every day")).toBe("Fresh bread, baked at 5am, every day");
    expect(plainDashes("well-known")).toBe("well-known");
  });
});

describe("similarity", () => {
  it("rates a reworded copy high and an unrelated post low", () => {
    const a = "3 mistakes people make with root canal care. Brush gently after treatment.";
    expect(similarity(a, "Three mistakes people make with root canal care: brush gently after treatment")).toBeGreaterThan(0.45);
    expect(similarity(a, "Eggless brownie boxes for Christmas, order before 20 December")).toBeLessThan(0.2);
  });
  it("flags a piece that repeats an earlier one in the batch", () => {
    const rows = [
      { title: "Why small batches teach better", caption: "Only 12 students per batch means every doubt gets answered." },
      { title: "Why small batches teach better", caption: "Only 12 students per batch means every doubt gets answered today." },
    ];
    expect(ruleFindings(rows, []).map((f) => f.index)).toEqual([1]);
  });
});

describe("invented numbers", () => {
  it("allows only numbers already in the brand information or original text", () => {
    const brand = "Batches capped at 12 students. Fees under Rs 2,500 a month.";
    expect(numbersAllowed("Only 12 students per batch, under 2500 a month", brand)).toBe(true);
    expect(numbersAllowed("97% of students score above 90", brand)).toBe(false);
  });
});

describe("variety planner", () => {
  it("gives every piece on one day a different angle and hook", async () => {
    const admin = {
      from: () => ({
        select: () => ({ eq: () => ({ eq: () => ({ not: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }) }) }) }),
      }),
    } as never;
    const playbook = {
      pillars: ["Education", "Proof", "Offers", "Behind the scenes", "Tips", "Stories"].map((name) => ({ name, angle: "x" })),
      preferred_templates: [],
      occasions: [],
      photo_subjects: [],
      visual_avoid: [],
    } as never;
    const date = "2026-12-14";
    const slots = slotsFromQuotas([date], { [date]: { linkedin_post: 2, instagram_post: 2, instagram_reel: 1, facebook_post: 1, twitter_post: 1, carousel: 1, blog: 1 } } as never);
    const plan = await planVariety(admin, { userId: "u", brandId: "b", slots, playbook });
    const metas = [...(plan?.values() ?? [])];
    expect(metas).toHaveLength(slots.length);
    expect(new Set(metas.map((m) => m.angle)).size).toBe(metas.length);
    expect(new Set(metas.map((m) => m.hook)).size).toBe(metas.length);
    expect(ANGLE_BANK.length).toBeGreaterThanOrEqual(20);
    expect(HOOK_STYLES.length).toBeGreaterThanOrEqual(16);
  });
});

import { SEED_PATTERNS, anglesFor, industryGroupOf } from "@/lib/pattern-library";

describe("pattern library", () => {
  it("has unique keys per dimension and enough breadth", () => {
    const seen = new Set<string>();
    for (const r of SEED_PATTERNS) {
      const k = `${r.dimension}|${r.key}`;
      expect(seen.has(k), k).toBe(false);
      seen.add(k);
      expect(r.template.length).toBeGreaterThan(10);
    }
    expect(SEED_PATTERNS.filter((r) => r.dimension === "hook").length).toBeGreaterThanOrEqual(45);
  });
  it("maps industries and adds industry angles", () => {
    expect(industryGroupOf("Dental clinic")).toBe("local_service");
    expect(industryGroupOf("Brass handicrafts")).toBe("product_brand");
    expect(industryGroupOf("Home bakery")).toBe("food");
    expect(anglesFor(SEED_PATTERNS, "food").length).toBeGreaterThan(anglesFor(SEED_PATTERNS, null).length);
  });
});

import { brandContext, withoutCarousels, weeklyContentPlan } from "@/lib/content.server";

describe("brand profile coverage", () => {
  it("passes every filled profile field into the writer's brand context", () => {
    const tokens = {
      business_name: "zzName", website: "zzSite", description: "zzDesc", products_services: "zzProducts", icp: "zzIcp",
      propositions: "zzProps", tone: "zzTone", keywords: "zzKeys", industry: "zzIndustry", current_offers: "zzOffers",
      testimonials: "zzTesti", competitors: "zzComp", locations: "zzPlaces", languages: "zzLang",
      voice_dos_donts: "zzVoice", compliance_notes: "zzRules",
    };
    const ctx = brandContext({ ...tokens, social_handles: { Instagram: "zzHandle" }, brand_colors: { primary: "#112233", secondary: "#445566", accent: "#778899" } } as never);
    for (const t of Object.values(tokens)) expect(ctx, t).toContain(t);
    expect(ctx).toContain("zzHandle");
    expect(ctx).toContain("#112233");
  });
  it("never mixes languages even when the audience speaks Hindi", () => {
    expect(brandContext({ business_name: "x", languages: "Hindi, English", social_handles: null } as never)).not.toContain("Hinglish");
  });
  it("gives every day of the week content even with carousels off", () => {
    delete process.env["CAROUSEL_ENABLED"];
    const dates = ["2026-12-21", "2026-12-22", "2026-12-23", "2026-12-24", "2026-12-25", "2026-12-26", "2026-12-27"];
    const plan = weeklyContentPlan(dates);
    withoutCarousels(plan);
    for (const d of dates) expect(Object.values(plan[d]!).some((n) => n > 0), d).toBe(true);
  });
});

import { pickVideoLanguage, spokenLanguagesOf, voiceSpecFor, HINDI_KEEP_ENGLISH } from "@/lib/languages";

describe("spoken languages", () => {
  it("detects Hindi and English in the profile field", () => {
    expect(spokenLanguagesOf("English, Hindi")).toEqual(["hi", "en"]);
    expect(spokenLanguagesOf("Tamil")).toEqual([]);
  });
  it("stays English unless the audience speaks Hindi", () => {
    expect(pickVideoLanguage("English", "a")).toBe("en");
    expect(pickVideoLanguage("", "a")).toBe("en");
    expect(pickVideoLanguage("Hindi", "a")).toBe("hi");
    const picks = new Set(["a", "b", "c", "d", "e", "f"].map((x) => pickVideoLanguage("English, Hindi", x)));
    expect(picks.size).toBe(2);
  });
  it("uses a native Hindi voice by default and keeps common English words", () => {
    expect(voiceSpecFor("hi")).toMatchObject({ model: "polly-neural", voice: "Kajal", language: "hi-IN" });
    expect(HINDI_KEEP_ENGLISH).toEqual(expect.arrayContaining(["table", "chair", "phone"]));
  });
});

import { occasionLine, occasionsNear } from "@/lib/occasions";

describe("occasion calendar", () => {
  it("shows Christmas, not Diwali, for the 21-27 Dec 2026 week", () => {
    for (const d of ["2026-12-21", "2026-12-23", "2026-12-27"]) {
      const names = occasionsNear(d).map((o) => o.name);
      expect(names).toContain("Christmas");
      expect(names).not.toContain("Diwali");
    }
  });
  it("lists Diwali for early November and says none when nothing is close", () => {
    expect(occasionsNear("2026-10-25").map((o) => o.name)).toContain("Diwali");
    expect(occasionLine("2026-08-05")).not.toContain("Diwali");
    expect(occasionLine("2026-06-25")).toContain("do not mention any festival");
  });
  it("alternates the Hindi reel by day", () => {
    const a = pickVideoLanguage("English, Hindi", "2026-12-23");
    const b = pickVideoLanguage("English, Hindi", "2026-12-26");
    expect(a).not.toBe(b);
  });
});

import { unsupportedClaims } from "@/lib/content-quality.server";

describe("claims the brand never made", () => {
  const brand = "Brew Cafe. Offer: buy 2 weekday coffees get a pastry free before 11 AM. Beans roasted weekly.";
  it("flags invented numbers, stories and off-season festivals", () => {
    const bad = { title: "21 cups a week", caption: "Meet Arjun, he went from 50% to 80%. Happy Diwali!", scheduled_date: "2026-12-08" };
    const found = unsupportedClaims(bad, brand).join(" | ");
    expect(found).toContain("numbers");
    expect(found).toContain("customer story");
    expect(found).toContain("Diwali");
  });
  it("accepts numbers from the brand text and Christmas near 21 Dec", () => {
    const ok = { title: "Buy 2, get a pastry free before 11 AM", caption: "Christmas gifting is close.", scheduled_date: "2026-12-21" };
    expect(unsupportedClaims(ok, brand)).toEqual([]);
  });
});

describe("poster copy separators", () => {
  it("accepts a single pipe between the parts", () => {
    const c = posterCopyFor({ image_prompt: "Weekly tests keep parents informed | Weekly test | Parent report | Free demo | Book a demo" }, { website: "" });
    expect(c.headline).toBe("Weekly tests keep parents informed");
    expect(c.points.length).toBe(3);
  });
});

import { withoutListCounts } from "@/lib/content-quality.server";
import { withoutUnavailableChannels } from "@/lib/content.server";
import { posterCopyFor } from "@/lib/poster.server";

describe("whole numbers, list counts, channels and weak headlines", () => {
  it("does not accept a number just because it sits inside a longer one", () => {
    expect(numbersAllowed("7 cups a week", "open 2027 and 70 seats")).toBe(false);
    expect(numbersAllowed("From 55 to 70", "classes of 20 students")).toBe(false);
    expect(numbersAllowed("only 20 students, Rs 1,499", "20 students at Rs 1499")).toBe(true);
  });
  it("lets a piece count its own list items", () => {
    expect(numbersAllowed(withoutListCounts("5 quick tips and 3 ways"), "nothing")).toBe(true);
    expect(numbersAllowed(withoutListCounts("7 cups a week"), "nothing")).toBe(false);
  });
  it("plans TikTok only when the brand has a TikTok handle", () => {
    const dates = ["2026-12-07", "2026-12-08", "2026-12-09", "2026-12-10", "2026-12-11", "2026-12-12", "2026-12-13"];
    const a = weeklyContentPlan(dates);
    withoutUnavailableChannels(a, { social_handles: { instagram: "x" } } as never);
    expect(Object.values(a).some((q) => q.tiktok_video > 0)).toBe(false);
    expect(a["2026-12-12"]!.product_service_video).toBe(1);
    const b = weeklyContentPlan(dates);
    withoutUnavailableChannels(b, { social_handles: { TikTok: "x" } } as never);
    expect(b["2026-12-12"]!.tiktok_video).toBe(1);
  });
  it("uses the title when the poster headline is only a label", () => {
    const c = posterCopyFor({ title: "First-Time Gift Givers, Avoid the Common Mistake", summary: "", image_prompt: "Checklist || Pick a size || Check the finish || Add a note" }, { website: "" });
    expect(c.headline).toMatch(/Gift Givers/);
  });
});

import { finalizeRows, unsupportedClaims as claimsOf } from "@/lib/content-quality.server";

describe("last-line clean-up", () => {
  const brand = "Smile Studio Dental. Fixed prices. Free first consultation.";
  it("flags placeholders and promises the brand never made, but not script markers", () => {
    expect(claimsOf({ title: "Root canal", caption: "Try the [thing] today", scheduled_date: "2026-12-08" }, brand).join(" ")).toMatch(/placeholder/);
    expect(claimsOf({ title: "Guaranteed results", caption: "ok", scheduled_date: "2026-12-08" }, brand).join(" ")).toMatch(/never made/);
    expect(claimsOf({ title: "Guaranteed results", caption: "ok", scheduled_date: "2026-12-08" }, `${brand} guaranteed`).length).toBe(0);
    expect(claimsOf({ title: "Painless root canal", caption: "ok", scheduled_date: "2026-12-08" }, `${brand} painless`).join(" ")).toMatch(/cannot make/);
    expect(claimsOf({ title: "Demo", caption: "ok", video_script: "[HOOK] Hi. [BODY] Fixed prices. [CTA] Book.", scheduled_date: "2026-12-08" }, brand).length).toBe(0);
  });
  it("keeps X posts short, scripts finished and poster text free of made-up acronyms", () => {
    const rows: Array<Record<string, unknown>> = [
      { type: "twitter_post", caption: `${"Fixed prices for every visit. ".repeat(12)}` },
      { type: "product_service_video", video_script: "[HOOK] Book today. [BODY] Our fixed prices help you plan. We also" },
      { type: "instagram_post", title: "Draft a GST invoice", caption: "Fast invoices", image_prompt: "GPS invoice || a || b || c || d" },
    ];
    finalizeRows(rows, "LedgerLoop GST invoices");
    expect(String(rows[0]!["caption"]).length).toBeLessThanOrEqual(280);
    expect(String(rows[1]!["video_script"])).toMatch(/plan\.$/);
    expect(String(rows[2]!["image_prompt"])).toMatch(/^Draft a GST invoice/);
  });
});

describe("hard promises and poster numbers", () => {
  it("flags painless and instant even when the brand text mentions the word", () => {
    const r = { title: "Painless Root Canal Experience", caption: "Instant payment for you", image_prompt: "", scheduled_date: "2026-12-10" } as never;
    const out = unsupportedClaims(r, "Compliance notes: never promise painless results");
    expect(out.join(" ")).toMatch(/painless/i);
  });
  it("flags instant promises", () => {
    const r = { title: "Get paid", caption: "Instant payment for you", image_prompt: "", scheduled_date: "2026-12-10" } as never;
    expect(unsupportedClaims(r, "LedgerLoop invoices").join(" ")).toMatch(/instant/i);
  });
  it("checks numbers written only in the poster text", () => {
    const r = { title: "Fixed prices", caption: "Clear prices", image_prompt: "Save up to 20% || x || y", scheduled_date: "2026-12-12" } as never;
    expect(unsupportedClaims(r, "Smile Studio fixed prices").join(" ")).toMatch(/20/);
  });
});

describe("amounts, offers, keywords and language", () => {
  const brandTxt = "Business name: Cafe\nCurrent offers (promote only these): Buy 2 weekday coffees, get a pastry free before 11 AM\nFocus keywords (must appear naturally): specialty coffee Indiranagar, brunch Bengaluru\nOpen 3 days a week from 8 AM";
  const row = (caption: string) => ({ title: "Coffee", caption, scheduled_date: "2026-12-10" }) as never;
  it("flags money, percent and weights that are not in the brand text", () => {
    expect(unsupportedClaims(row("Only ₹2,500 today, specialty coffee Indiranagar"), brandTxt).join(" ")).toMatch(/2,500/);
    expect(unsupportedClaims(row("A 3% rise, specialty coffee Indiranagar"), brandTxt).join(" ")).toMatch(/3%/);
    expect(unsupportedClaims(row("8-kg beans, specialty coffee Indiranagar"), brandTxt).join(" ")).toMatch(/8-kg/);
  });
  it("accepts units that the brand text states", () => {
    expect(unsupportedClaims(row("Open 3 days a week, specialty coffee Indiranagar"), brandTxt)).toEqual([]);
  });
  it("flags an offer that is reworded but accepts it quoted exactly", () => {
    expect(unsupportedClaims(row("A free pastry with every weekday coffee bundle before 11 AM, specialty coffee Indiranagar"), brandTxt).join(" ")).toMatch(/offer is not quoted exactly/);
    expect(unsupportedClaims(row("Buy 2 weekday coffees, get a pastry free before 11 AM at our specialty coffee Indiranagar cafe"), brandTxt)).toEqual([]);
  });
  it("needs a focus keyword and English only", () => {
    expect(unsupportedClaims(row("Fresh roasts every week"), brandTxt).join(" ")).toMatch(/focus keywords/);
    expect(unsupportedClaims(row("Aapka ghar jaisa cafe, specialty coffee Indiranagar"), brandTxt).join(" ")).toMatch(/non-English/);
  });
});
