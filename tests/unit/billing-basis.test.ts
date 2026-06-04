import { describe, expect, it } from "vitest";
import {
  annualFromBandHourly,
  dedicatedDayRate,
  monthlyFromAnnual,
  pickBandAnnual,
  resolveDedicatedDayRate,
  resolveRebadgedDayRate,
} from "../../src/lib/invoice/billing-basis";

describe("monthlyFromAnnual", () => {
  it("annual / 12", () => {
    expect(monthlyFromAnnual(74100)).toBeCloseTo(6175, 6);
    expect(monthlyFromAnnual(0)).toBe(0);
    expect(monthlyFromAnnual(null)).toBe(0);
  });
});

describe("dedicatedDayRate", () => {
  it("spreads annual/12 across the month's business days", () => {
    expect(dedicatedDayRate(74100, 22)).toBeCloseTo(280.6818, 3); // 6175 / 22
    expect(dedicatedDayRate(64000, 22)).toBeCloseTo(242.4242, 3); // 5333.33 / 22
  });

  it("a fully-worked month bills exactly annual/12", () => {
    expect(dedicatedDayRate(74100, 22) * 22).toBeCloseTo(6175, 2);
    expect(dedicatedDayRate(64000, 22) * 22).toBeCloseTo(5333.33, 2);
  });

  it("a 21-day month at 21 days worked matches the FSO Steven Patten line", () => {
    expect(dedicatedDayRate(74100, 22) * 21).toBeCloseTo(5894.32, 2);
  });

  it("returns 0 for non-positive annual or zero business days", () => {
    expect(dedicatedDayRate(0, 22)).toBe(0);
    expect(dedicatedDayRate(74100, 0)).toBe(0);
    expect(dedicatedDayRate(null, 22)).toBe(0);
  });
});

describe("annualFromBandHourly", () => {
  it("bridges a band hourly back to annual (× 2080)", () => {
    expect(annualFromBandHourly(35.625)).toBe(74100); // Band 3 stored hourly
  });
  it("zero / null -> 0", () => {
    expect(annualFromBandHourly(0)).toBe(0);
    expect(annualFromBandHourly(null)).toBe(0);
  });
});

describe("pickBandAnnual", () => {
  it("prefers an exact annual row over a legacy hourly row", () => {
    // A band with both an annual row (64,000) and a stale hourly row uses the
    // annual exactly, with no 2080 round-trip.
    expect(pickBandAnnual(64000, 31.7308)).toBe(64000);
  });

  it("falls back to the legacy hourly row when there is no annual row", () => {
    expect(pickBandAnnual(null, 35.625)).toBe(74100); // Band 3 legacy hourly, exact
    // Band 2 legacy hourly (66,000 / 2080 rounded to 31.7308) round-trips to
    // 66,000.064, not 66,000 -- the cents drift the exact ANNUAL_RATE row avoids.
    expect(pickBandAnnual(undefined, 31.7308)).toBeCloseTo(66000.064, 3);
  });

  it("returns 0 when neither row is present or positive", () => {
    expect(pickBandAnnual(null, null)).toBe(0);
    expect(pickBandAnnual(0, 0)).toBe(0);
  });
});

describe("resolveDedicatedDayRate", () => {
  const bd = 22;

  it("JLL unchanged: a band ANNUAL_RATE resolves to annual/12/bd (no DAY_RATE/MONTHLY)", () => {
    const r = resolveDedicatedDayRate({
      perTechAnnual: 0,
      explicitDayRate: 0,
      bandAnnual: 74100,
      monthly: 0,
      businessDays: bd,
    });
    expect(r).toBeCloseTo(280.6818, 3); // == dedicatedDayRate(74100, 22)
  });

  it("a per-tech salary overrides everything (annual/12/bd)", () => {
    const r = resolveDedicatedDayRate({
      perTechAnnual: 96000,
      explicitDayRate: 999,
      bandAnnual: 74100,
      monthly: 9999,
      businessDays: bd,
    });
    expect(r).toBeCloseTo(96000 / 12 / 22, 6);
  });

  it("an explicit DAY_RATE is billed directly (no /12/bd) when no per-tech salary", () => {
    const r = resolveDedicatedDayRate({
      perTechAnnual: 0,
      explicitDayRate: 350,
      bandAnnual: 74100,
      monthly: 0,
      businessDays: bd,
    });
    expect(r).toBe(350);
  });

  it("MONTHLY resolves to monthly/bd when nothing higher is set (full month = monthly)", () => {
    const r = resolveDedicatedDayRate({
      perTechAnnual: 0,
      explicitDayRate: 0,
      bandAnnual: 0,
      monthly: 6175,
      businessDays: bd,
    });
    expect(r).toBeCloseTo(6175 / 22, 6);
    expect(r * 22).toBeCloseTo(6175, 6);
  });

  it("returns 0 when no source is present", () => {
    expect(
      resolveDedicatedDayRate({ perTechAnnual: 0, explicitDayRate: 0, bandAnnual: 0, monthly: 0, businessDays: bd }),
    ).toBe(0);
  });
});

describe("resolveRebadgedDayRate", () => {
  const bd = 22;
  const base = { dayRate: 0, monthlyRate: 0, annual: 0, hourlyRate: 0, defaultHours: 8, businessDays: bd };

  it("unchanged: with only an annual override, returns annual/12/bd (today's behavior)", () => {
    expect(resolveRebadgedDayRate({ ...base, annual: 66000 })).toBeCloseTo(66000 / 12 / 22, 6);
  });

  it("an explicit Day rate is billed directly and wins over all others", () => {
    expect(
      resolveRebadgedDayRate({ ...base, dayRate: 300, monthlyRate: 9999, annual: 99999, hourlyRate: 99 }),
    ).toBe(300);
  });

  it("Monthly resolves to monthly/bd when no Day rate (full month = monthly)", () => {
    const r = resolveRebadgedDayRate({ ...base, monthlyRate: 6175, annual: 66000 });
    expect(r).toBeCloseTo(6175 / 22, 6);
    expect(r * 22).toBeCloseTo(6175, 6);
  });

  it("Hourly resolves to hourly × Default Hours when nothing higher is set", () => {
    expect(resolveRebadgedDayRate({ ...base, hourlyRate: 40 })).toBe(320); // 40 × 8
  });

  it("returns 0 when no rebadged rate is set", () => {
    expect(resolveRebadgedDayRate(base)).toBe(0);
  });
});
