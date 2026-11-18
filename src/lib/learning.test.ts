import { afterEach, describe, expect, it } from "vitest";
import { carouselsEnabled, clampPostingTime, strategyContext } from "@/lib/content.server";
import { assessSignal, measuredRows, type Row } from "@/lib/strategy-queue.server";
import { istNow, processPublishQueue } from "@/lib/channels/publish-queue.server";
import { strategyChatOptions } from "@/lib/ai.server";

const row = (over: Partial<Row> = {}): Row => ({
  user_id: "u",
  brand_id: "b",
  scheduled_date: "2026-11-10",
  scheduled_time: "10:00:00",
  type: "linkedin_post",
  title: "t",
  status: "posted",
  platforms: ["linkedin"],
  impressions: 100,
  clicks: 2,
  engagements: 5,
  metrics_updated_at: "2026-11-12T00:00:00Z",
  ...over,
});

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe("posting time", () => {
  it("keeps a valid learned time and pads it", () => {
    expect(clampPostingTime("9:05", "12:00")).toBe("09:05");
    expect(clampPostingTime("18:30", "12:00")).toBe("18:30");
  });
  it("clamps to posting hours and rejects junk", () => {
    expect(clampPostingTime("03:00", "12:00")).toBe("07:00");
    expect(clampPostingTime("23:45", "12:00")).toBe("22:00");
    expect(clampPostingTime("25:00", "12:00")).toBe("12:00");
    expect(clampPostingTime("evening", "12:00")).toBe("12:00");
    expect(clampPostingTime(undefined, "12:00")).toBe("12:00");
  });
  it("tells the generator to use the learned window", () => {
    const text = strategyContext({
      week_start: "2026-11-01",
      week_end: "2026-11-14",
      insights: "i",
      directives: "d",
    });
    expect(text).toContain('"time" field');
    expect(text).toContain("India time");
  });
  it("reads IST, not UTC", () => {
    // 19:30 UTC on 9 Nov is 01:00 IST on 10 Nov.
    expect(istNow(new Date("2026-11-09T19:30:00Z"))).toEqual({ today: "2026-11-10", time: "01:00:00" });
    expect(istNow(new Date("2026-11-10T01:30:00Z"))).toEqual({ today: "2026-11-10", time: "07:00:00" });
  });
});

describe("publish queue", () => {
  function recorder() {
    const calls: string[] = [];
    const q: Record<string, unknown> = {};
    const chain = (name: string) => (...args: unknown[]) => {
      calls.push(`${name}:${args.join(",")}`);
      return q;
    };
    for (const m of ["select", "eq", "lte", "lt", "or", "order", "in"]) q[m] = chain(m);
    q["limit"] = async () => ({ data: [] });
    return { client: { from: () => q }, calls };
  }
  it("asks only for items that are due when time-aware", async () => {
    const { client, calls } = recorder();
    await processPublishQueue(client as never, {});
    expect(calls.some((c) => c.startsWith("or:") && c.includes("scheduled_time.lte."))).toBe(true);
    expect(calls).toContain("order:scheduled_time,[object Object]");
  });
  it("keeps the old post-everything-today behaviour when ignoreTime is set", async () => {
    const { client, calls } = recorder();
    await processPublishQueue(client as never, { ignoreTime: true });
    expect(calls.some((c) => c.startsWith("or:"))).toBe(false);
  });
});

describe("learning signal", () => {
  it("ignores posts that were never measured", () => {
    const rows = [row(), row({ metrics_updated_at: null, impressions: 0 })];
    expect(measuredRows(rows)).toHaveLength(1);
  });
  it("refuses to learn from a thin sample", () => {
    const few = Array.from({ length: 3 }, () => row());
    expect(assessSignal(few).enough).toBe(false);
    const quiet = Array.from({ length: 8 }, () => row({ impressions: 5 }));
    expect(assessSignal(quiet).enough).toBe(false);
  });
  it("learns once there are enough measured posts and views", () => {
    const rows = Array.from({ length: 8 }, () => row());
    expect(assessSignal(rows)).toMatchObject({ enough: true, pieces: 8, impressions: 800 });
  });
  it("lets the thresholds be tuned from the environment", () => {
    process.env["LEARN_MIN_PIECES"] = "2";
    process.env["LEARN_MIN_IMPRESSIONS"] = "10";
    expect(assessSignal([row(), row()]).enough).toBe(true);
  });
});

describe("switches", () => {
  it("carousels are off unless enabled", () => {
    delete process.env["CAROUSEL_ENABLED"];
    expect(carouselsEnabled()).toBe(false);
    process.env["CAROUSEL_ENABLED"] = "true";
    expect(carouselsEnabled()).toBe(true);
  });
  it("uses a stronger model for strategy by default and allows an override", () => {
    delete process.env["STRATEGY_MODEL"];
    expect(strategyChatOptions().model).toBe("openai/gpt-oss-120b");
    process.env["STRATEGY_MODEL"] = "qwen/qwen3-32b";
    expect(strategyChatOptions().model).toBe("qwen/qwen3-32b");
  });
});
