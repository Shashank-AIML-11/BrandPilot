import { describe, expect, it } from "vitest";
import { htmlToText, isBlockedAddress, normaliseSiteUrl, socialLinks } from "@/lib/site-scrape.server";
import {
  chunkText,
  competitorUrls,
  mergeDocAnalyses,
  normaliseProfileFields,
  renderKnowledge,
  type KnowledgeRow,
} from "@/lib/brand-knowledge.server";
import { summarise, trendOf, type Row } from "@/lib/strategy-queue.server";

describe("website scraper safety", () => {
  it("blocks private, loopback, link-local and metadata addresses", () => {
    for (const ip of ["127.0.0.1", "10.0.0.5", "172.16.3.1", "192.168.1.1", "169.254.169.254", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) {
      expect(isBlockedAddress(ip), ip).toBe(true);
    }
  });
  it("allows ordinary public addresses", () => {
    expect(isBlockedAddress("8.8.8.8")).toBe(false);
    expect(isBlockedAddress("2606:4700:4700::1111")).toBe(false);
  });
  it("refuses things that are not IPs", () => {
    expect(isBlockedAddress("not-an-ip")).toBe(true);
  });
  it("normalises bare domains and rejects bad schemes", () => {
    expect(normaliseSiteUrl("acme.com").href).toBe("https://acme.com/");
    expect(() => normaliseSiteUrl("ftp://acme.com")).toThrow();
    expect(() => normaliseSiteUrl("")).toThrow();
  });
});

describe("website text", () => {
  it("drops scripts and styles and keeps visible text", () => {
    const text = htmlToText("<html><style>.a{}</style><script>alert(1)</script><h1>Hello</h1><p>World &amp; co</p></html>");
    expect(text).toContain("Hello");
    expect(text).toContain("World & co");
    expect(text).not.toContain("alert");
  });
  it("maps social links to profile handle formats and skips share links", () => {
    const out = socialLinks([
      "https://www.instagram.com/acme/",
      "https://twitter.com/intent/tweet?url=x",
      "https://www.linkedin.com/company/acme",
      "https://www.facebook.com/sharer/sharer.php?u=x",
    ]);
    expect(out["Instagram"]).toBe("@acme");
    expect(out["LinkedIn"]).toContain("linkedin.com/company/acme");
    expect(Object.values(out).join(" ")).not.toContain("sharer");
    expect(out["X"]).toBeUndefined();
  });
});

describe("document reading", () => {
  it("splits long text into bounded pieces and loses nothing small", () => {
    const text = Array.from({ length: 40 }, (_, i) => `Paragraph ${i}. ${"word ".repeat(80)}`).join("\n\n");
    const chunks = chunkText(text, 3000, 50);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= 4500)).toBe(true);
    expect(chunkText("short", 3000, 50)).toEqual(["short"]);
    expect(chunkText("   ")).toEqual([]);
  });
  it("merges chunk analyses without duplicates", () => {
    const base = { summary: "", positioning: "", tone: "", goals: [], audience: [], key_messages: [], dos: [], donts: [], offers_and_claims: [], targets: [], channels_formats: [], rules: [], facts: [], content_pillars: [], campaigns: [] } as unknown as Parameters<typeof mergeDocAnalyses>[0][number];
    const a = { ...base, summary: "First", dos: ["Be warm", "Use rupees"] };
    const b = { ...base, summary: "Second", dos: ["be warm", "Short lines"] };
    const merged = mergeDocAnalyses([a, b]);
    expect(merged.summary).toBe("First Second");
    expect(merged.dos.length).toBeLessThanOrEqual(3);
    expect(merged.dos).toContain("Short lines");
  });
});

describe("profile suggestions", () => {
  it("clips every field to the form limit and keeps blanks blank", () => {
    const { fields } = normaliseProfileFields({ business_name: "A".repeat(500), tone: "  warm  ", icp: undefined, inferred: ["tone"] });
    expect(fields.business_name.length).toBe(120);
    expect(fields.tone).toBe("warm");
    expect(fields.icp).toBe("");
  });
  it("finds competitor websites in free text", () => {
    expect(competitorUrls("Rivals: acme.com, https://foo.io/pricing and mail@x.com")).toEqual(["https://acme.com", "https://foo.io/pricing"]);
    expect(competitorUrls(null)).toEqual([]);
  });
});

describe("brand knowledge in prompts", () => {
  const row = (over: Partial<KnowledgeRow>): KnowledgeRow => ({
    id: "1", brand_id: "b", user_id: "u", kind: "document", source_path: "p", source_name: "strategy.pdf",
    status: "ready", error: null, text_content: "", progress: 0, analysis: { summary: "Premium organic snacks for urban parents", dos: ["Show real ingredients"] },
    created_at: "", updated_at: "", ...over,
  });
  it("is empty when nothing is ready", () => {
    expect(renderKnowledge([], { maxChars: 2600, detailed: false })).toBe("");
    expect(renderKnowledge([row({ status: "processing" })], { maxChars: 2600, detailed: false })).toBe("");
  });
  it("includes document knowledge and respects the size cap", () => {
    const out = renderKnowledge([row({})], { maxChars: 2600, detailed: false });
    expect(out).toContain("Premium organic snacks");
    const big = row({ analysis: { summary: "x".repeat(9000), dos: Array.from({ length: 50 }, (_, i) => `rule ${i} ${"y".repeat(100)}`) } });
    expect(renderKnowledge([big], { maxChars: 1200, detailed: true }).length).toBeLessThanOrEqual(1200);
  });
});

describe("learning loop summaries", () => {
  const post = (over: Partial<Row>): Row => ({
    user_id: "u", brand_id: "b", scheduled_date: "2026-11-10", scheduled_time: "10:00:00", type: "linkedin_post",
    title: "t", status: "posted", platforms: ["linkedin"], impressions: 500, clicks: 10, engagements: 25,
    metrics_updated_at: "2026-11-11T00:00:00Z", style_meta: { pillar: "Education", hook: "question", template: "tips" },
    ...over,
  } as Row);
  it("groups results by pillar and hook", () => {
    const s = summarise([post({}), post({ style_meta: { pillar: "Offers", hook: "number", template: "sale" }, impressions: 100, engagements: 1 })]) as Record<string, unknown>;
    expect(JSON.stringify(s)).toContain("Education");
    expect(JSON.stringify(s)).toContain("Offers");
  });
  it("reports change against the previous period, or nothing without one", () => {
    expect(trendOf([post({})], [])).toBeNull();
    const t = trendOf([post({ impressions: 600 })], [post({ impressions: 300 })]);
    expect(t?.change_percent.avg_impressions_per_post).toBe(100);
  });
});
