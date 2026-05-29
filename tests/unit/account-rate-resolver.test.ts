import { describe, expect, it } from "vitest";
import { RateCategory } from "@prisma/client";
import {
  isActiveOn,
  overlapsRange,
  ratesForTechnician,
  ratesForTechnicianInRange,
} from "../../src/lib/domain/account-rate-resolver";

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

describe("overlapsRange", () => {
  const start = D("2026-05-01");
  const end = D("2026-06-01"); // exclusive

  it("matches a row whose window starts mid-period", () => {
    const row = { effectiveFrom: D("2026-05-25"), effectiveTo: D("2026-06-26") };
    expect(overlapsRange(row, start, end)).toBe(true);
  });

  it("matches an open-ended row that starts before the period ends", () => {
    expect(overlapsRange({ effectiveFrom: D("2026-05-31"), effectiveTo: null }, start, end)).toBe(true);
  });

  it("rejects a row that starts on/after the period end", () => {
    expect(overlapsRange({ effectiveFrom: D("2026-06-01"), effectiveTo: null }, start, end)).toBe(false);
  });

  it("rejects a row that ended on/before the period start", () => {
    expect(overlapsRange({ effectiveFrom: D("2026-01-01"), effectiveTo: D("2026-05-01") }, start, end)).toBe(false);
  });
});

describe("ratesForTechnicianInRange", () => {
  const start = D("2026-05-01");
  const end = D("2026-06-01");

  // Regression: a rate effective mid-month (2026-05-25) must resolve for the
  // May billing period. Anchoring on the 1st (ratesForTechnician) misses it.
  it("resolves a mid-month rate that point-in-time anchoring would miss", () => {
    const rates = [
      {
        band: 2,
        effectiveFrom: D("2026-05-25"),
        effectiveTo: D("2026-06-26"),
        rateSubCategory: { rateCategory: RateCategory.DEDICATED },
      },
    ];
    expect(ratesForTechnician(rates, RateCategory.DEDICATED, 2, start)).toHaveLength(0);
    expect(ratesForTechnicianInRange(rates, RateCategory.DEDICATED, 2, start, end)).toHaveLength(1);
  });

  it("sorts overlapping rows by effectiveFrom descending (latest terms first)", () => {
    const rates = [
      {
        band: 2,
        effectiveFrom: D("2026-05-01"),
        effectiveTo: D("2026-05-15"),
        rateSubCategory: { rateCategory: RateCategory.DEDICATED },
      },
      {
        band: 2,
        effectiveFrom: D("2026-05-15"),
        effectiveTo: null,
        rateSubCategory: { rateCategory: RateCategory.DEDICATED },
      },
    ];
    const out = ratesForTechnicianInRange(rates, RateCategory.DEDICATED, 2, start, end);
    expect(out).toHaveLength(2);
    expect(out[0].effectiveFrom).toEqual(D("2026-05-15"));
  });

  it("filters by band and category", () => {
    const rates = [
      {
        band: 1,
        effectiveFrom: D("2026-05-10"),
        effectiveTo: null,
        rateSubCategory: { rateCategory: RateCategory.DEDICATED },
      },
    ];
    expect(ratesForTechnicianInRange(rates, RateCategory.DEDICATED, 2, start, end)).toEqual([]);
  });
});
