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
  it("uses Hinglish when the audience languages say so", () => {
    expect(brandContext({ business_name: "x", languages: "Hindi, English", social_handles: null } as never)).toContain("Hinglish");
  });
  it("gives every day of the week content even with carousels off", () => {
    delete process.env["CAROUSEL_ENABLED"];
    const dates = ["2026-12-21", "2026-12-22", "2026-12-23", "2026-12-24", "2026-12-25", "2026-12-26", "2026-12-27"];
    const plan = weeklyContentPlan(dates);
    withoutCarousels(plan);
    for (const d of dates) expect(Object.values(plan[d]!).some((n) => n > 0), d).toBe(true);
  });
});
