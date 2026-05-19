import { describe, expect, it } from "vitest";
import { RateCategory } from "@prisma/client";
import { isActiveOn, ratesForTechnician } from "../../src/lib/domain/account-rate-resolver";

const D = (s: string) => new Date(`${s}T00:00:00Z`);

describe("isActiveOn", () => {
  it("is active on/after effectiveFrom and before effectiveTo (exclusive)", () => {
    const row = { effectiveFrom: D("2026-01-01"), effectiveTo: D("2026-07-01") };
    expect(isActiveOn(row, D("2026-01-01"))).toBe(true);
    expect(isActiveOn(row, D("2026-06-30"))).toBe(true);
    expect(isActiveOn(row, D("2026-07-01"))).toBe(false);
  });

  it("is inactive before effectiveFrom", () => {
    const row = { effectiveFrom: D("2026-03-01"), effectiveTo: null };
    expect(isActiveOn(row, D("2026-02-28"))).toBe(false);
  });

  it("treats null effectiveTo as open-ended", () => {
    expect(isActiveOn({ effectiveFrom: D("2020-01-01"), effectiveTo: null }, D("2099-01-01"))).toBe(true);
  });
});

describe("ratesForTechnician", () => {
  const rates = [
    {
      band: 2,
      effectiveFrom: D("2026-01-01"),
      effectiveTo: null,
      rateSubCategory: { rateCategory: RateCategory.PROJECT_TM },
    },
    {
      band: 1,
      effectiveFrom: D("2026-01-01"),
      effectiveTo: null,
      rateSubCategory: { rateCategory: RateCategory.PROJECT_TM },
    },
    {
      band: 2,
      effectiveFrom: D("2026-01-01"),
      effectiveTo: null,
      rateSubCategory: { rateCategory: RateCategory.DEDICATED },
    },
  ];

  it("matches category + band + active window", () => {
    const out = ratesForTechnician(rates, RateCategory.PROJECT_TM, 2, D("2026-06-01"));
    expect(out).toHaveLength(1);
    expect(out[0].band).toBe(2);
    expect(out[0].rateSubCategory.rateCategory).toBe(RateCategory.PROJECT_TM);
  });

  it("returns empty when no row matches the band", () => {
    expect(ratesForTechnician(rates, RateCategory.PROJECT_TM, 3, D("2026-06-01"))).toEqual([]);
  });

  it("returns empty when category mismatch", () => {
    expect(ratesForTechnician(rates, RateCategory.DISPATCH_SCHED, 2, D("2026-06-01"))).toEqual([]);
  });
});
