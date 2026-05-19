import { describe, expect, it } from "vitest";
import { TechType } from "@prisma/client";
import { isActive, filterActiveForTechType } from "../../src/lib/domain/rate-card-resolver";

const D = (s: string) => new Date(`${s}T00:00:00Z`);

describe("isActive", () => {
  it("is active on/after effectiveFrom and before effectiveTo", () => {
    const card = { effectiveFrom: D("2026-01-01"), effectiveTo: D("2026-07-01") };
    expect(isActive(card, D("2026-01-01"))).toBe(true);
    expect(isActive(card, D("2026-06-30"))).toBe(true);
    expect(isActive(card, D("2026-07-01"))).toBe(false);
  });

  it("is inactive before effectiveFrom", () => {
    const card = { effectiveFrom: D("2026-03-01"), effectiveTo: null };
    expect(isActive(card, D("2026-02-28"))).toBe(false);
    expect(isActive(card, D("2026-03-01"))).toBe(true);
  });

  it("treats null effectiveTo as open-ended", () => {
    const card = { effectiveFrom: D("2020-01-01"), effectiveTo: null };
    expect(isActive(card, D("2099-01-01"))).toBe(true);
  });
});

describe("filterActiveForTechType", () => {
  const cards = [
    { techType: TechType.FTE, effectiveFrom: D("2026-01-01"), effectiveTo: null },
    { techType: TechType.FTE, effectiveFrom: D("2025-01-01"), effectiveTo: D("2026-01-01") },
    { techType: TechType.DISPATCH, effectiveFrom: D("2026-01-01"), effectiveTo: null },
  ];

  it("matches both tech type and active window", () => {
    const out = filterActiveForTechType(cards, TechType.FTE, D("2026-06-01"));
    expect(out).toHaveLength(1);
    expect(out[0].effectiveFrom).toEqual(D("2026-01-01"));
  });

  it("returns empty when no active card matches", () => {
    expect(filterActiveForTechType(cards, TechType.PROJECT, D("2026-06-01"))).toEqual([]);
  });
});
