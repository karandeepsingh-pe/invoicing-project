import { describe, expect, it } from "vitest";
import {
  annualFromBandHourly,
  annualToHourly,
  dedicatedDayRate,
  monthlyFromAnnual,
} from "../../src/lib/invoice/billing-basis";

describe("annualToHourly", () => {
  it("annual / 2080", () => {
    expect(annualToHourly(74100)).toBeCloseTo(35.625, 6);
    expect(annualToHourly(66000)).toBeCloseTo(66000 / 2080, 6);
  });

  it("zero / null / undefined / negative -> 0", () => {
    expect(annualToHourly(0)).toBe(0);
    expect(annualToHourly(null)).toBe(0);
    expect(annualToHourly(undefined)).toBe(0);
    expect(annualToHourly(-100)).toBe(0);
  });
});

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
