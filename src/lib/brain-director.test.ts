import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai.server", () => ({
  chatJSON: vi.fn(async () => ({
    items: [
      { i: 0, pillar: "Education", hook: "myth_bust", angle: 1, recipe: "myth_vs_fact_card", why: "trust first; audience asked about care" },
      { i: 1, pillar: "Not a pillar", hook: "myth_bust", angle: 1, recipe: "", why: "" }, // same-day repeat and bad pillar
      { i: 2, pillar: "Offers", hook: "nope", angle: 99, recipe: "", why: "offer ahead of Diwali" }, // unknown hook and angle
    ],
  })),
}));

import { directPicks } from "@/lib/brain-director.server";

const playbook = {
  voice_summary: "warm",
  pillars: [{ name: "Education", angle: "teach" }, { name: "Offers", angle: "sell" }],
  audience_pains: [], priorities: [], proof_points: [], what_works: [], what_to_avoid: [], occasions: [], cta_style: "", competitive_angle: "",
} as never;

describe("brain director", () => {
  it("keeps valid picks and drops invalid ones", async () => {
    const slots = [
      { date: "2026-12-14", type: "reel", index: 0 },
      { date: "2026-12-14", type: "post", index: 0 },
      { date: "2026-12-15", type: "post", index: 0 },
    ];
    const out = await directPicks({
      industry: "dental",
      playbook,
      slots,
      hooks: [{ id: "myth_bust", how: "x" }],
      angles: ["a", "b"],
      recipes: [{ id: "myth_vs_fact_card", note: "n" }],
      isVideo: (t) => t === "reel",
      fallback: new Map(),
      keyOf: (s) => `${s.date}|${s.type}|${s.index}`,
    });
    const a = out.get("2026-12-14|reel|0")!;
    expect(a.hook).toBe("myth_bust");
    expect(a.angle).toBe("b");
    expect(a.recipe).toBe("myth_vs_fact_card");
    const b = out.get("2026-12-14|post|0")!;
    expect(b.pillar).toBeUndefined();
    expect(b.hook).toBeUndefined(); // same hook twice on one day is refused
    expect(b.angle).toBeUndefined();
    const c = out.get("2026-12-15|post|0")!;
    expect(c.hook).toBeUndefined();
    expect(c.angle).toBeUndefined();
    expect(c.pillar).toBe("Offers");
    expect(c.why).toContain("Diwali");
  });
});
