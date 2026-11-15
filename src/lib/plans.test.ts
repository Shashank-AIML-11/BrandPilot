import { describe, expect, it } from "vitest";
import {
  ANNUAL_PERIOD_DAYS,
  annualSavingInr,
  parseBillingCycle,
  periodDaysFor,
  planById,
  planPerMonthInr,
  planTotalInr,
  PLANS,
} from "@/lib/plans";
import { nextPeriodEnd } from "@/lib/plan-access";

describe("pricing", () => {
  it("has the agreed monthly and annual per-month prices", () => {
    const got = PLANS.map((p) => [p.id, p.priceMonthly, p.priceAnnualPerMonth]);
    expect(got).toEqual([
      ["starter", 2499, 1499],
      ["growth", 4165, 2499],
      ["scale", 41665, 24999],
    ]);
  });
  it("charges 12 x the annual per-month rate once a year", () => {
    expect(planTotalInr(planById("starter")!, "annual")).toBe(17988);
    expect(planTotalInr(planById("growth")!, "annual")).toBe(29988);
    expect(planTotalInr(planById("scale")!, "annual")).toBe(299988);
    expect(planTotalInr(planById("growth")!, "monthly")).toBe(4165);
  });
  it("annual per-month is about 40% below monthly", () => {
    for (const p of PLANS) {
      const off = 1 - p.priceAnnualPerMonth / p.priceMonthly;
      expect(off).toBeGreaterThan(0.399);
      expect(off).toBeLessThan(0.401);
    }
    expect(annualSavingInr(planById("starter")!)).toBe(12000);
    expect(planPerMonthInr(planById("starter")!, "annual")).toBe(1499);
  });
  it("defaults unknown cycles to monthly and sets period lengths", () => {
    expect(parseBillingCycle("annual")).toBe("annual");
    expect(parseBillingCycle("weekly")).toBe("monthly");
    expect(parseBillingCycle(undefined)).toBe("monthly");
    expect(periodDaysFor("monthly")).toBe(30);
    expect(periodDaysFor("annual")).toBe(ANNUAL_PERIOD_DAYS);
  });
  it("extends an annual plan by 365 days after the current end", () => {
    const now = new Date("2026-11-16T00:00:00Z");
    const end = new Date("2026-11-30T00:00:00Z");
    expect(nextPeriodEnd(end, now, 365).toISOString()).toBe("2027-11-30T00:00:00.000Z");
    expect(nextPeriodEnd(null, now, 365).toISOString()).toBe("2027-11-16T00:00:00.000Z");
    expect(nextPeriodEnd(end, now).toISOString()).toBe("2026-12-30T00:00:00.000Z");
  });
});
