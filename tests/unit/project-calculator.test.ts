import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import {
  calculateProjectRow,
  type ProjectRateRow,
  type ProjectTimesheetCell,
} from "@/lib/invoice/project-calculator";

const Decimal = Prisma.Decimal;
const dec = (n: number) => new Decimal(n);

const rates: ProjectRateRow[] = [
  {
    rateAmount: dec(420),
    band: 2,
    rateSubCategory: { code: "FULL_DAY" },
    sla: { code: "SCHEDULE" },
  },
];

function hours(n: number): ProjectTimesheetCell {
  return { hours: dec(n), status: null };
}

describe("calculateProjectRow", () => {
  it("15 days × 420 = 6300", () => {
    const result = calculateProjectRow({
      defaultHours: 8,
      band: 2,
      entries: Array.from({ length: 15 }, () => hours(8)),
      rates,
    });
    expect(result.daysWorked.toNumber()).toBe(15);
    expect(result.dayRate.toNumber()).toBe(420);
    expect(result.extendedTotal.toNumber()).toBe(6300);
  });

  it("half-day fractions multiply rate", () => {
    const result = calculateProjectRow({
      defaultHours: 8,
      band: 2,
      entries: [hours(8), hours(4)],
      rates,
    });
    expect(result.daysWorked.toNumber()).toBe(1.5);
    expect(result.extendedTotal.toNumber()).toBe(630);
  });

  it("missing rate falls back to zero", () => {
    const result = calculateProjectRow({
      defaultHours: 8,
      band: 2,
      entries: [hours(8)],
      rates: [],
    });
    expect(result.extendedTotal.toNumber()).toBe(0);
  });

  it("band mismatch returns zero", () => {
    const result = calculateProjectRow({
      defaultHours: 8,
      band: 3,
      entries: [hours(8)],
      rates,
    });
    expect(result.dayRate.toNumber()).toBe(0);
  });
});

describe("calculateProjectRow monthly cap (JLL model)", () => {
  // US Project pricing from the JLL sheet: Full Day 410, Monthly 8,800.
  const cappedRates: ProjectRateRow[] = [
    { rateAmount: dec(410), band: 2, rateSubCategory: { code: "FULL_DAY" }, sla: { code: "SCHEDULE" } },
    { rateAmount: dec(8800), band: 2, rateSubCategory: { code: "MONTHLY" }, sla: { code: "SCHEDULE" } },
  ];

  it("a full 22-day month caps at the monthly rate (8,800, not 9,020)", () => {
    const result = calculateProjectRow({
      defaultHours: 8,
      band: 2,
      entries: Array.from({ length: 22 }, () => hours(8)),
      rates: cappedRates,
    });
    expect(result.daysWorked.toNumber()).toBe(22);
    expect(result.capped).toBe(true);
    expect(result.extendedTotal.toNumber()).toBe(8800);
  });

  it("a partial month bills per day under the cap (20 × 410 = 8,200)", () => {
    const result = calculateProjectRow({
      defaultHours: 8,
      band: 2,
      entries: Array.from({ length: 20 }, () => hours(8)),
      rates: cappedRates,
    });
    expect(result.capped).toBe(false);
    expect(result.extendedTotal.toNumber()).toBe(8200);
  });

  it("with no monthly rate the per-day total is uncapped (back-compat)", () => {
    const result = calculateProjectRow({
      defaultHours: 8,
      band: 2,
      entries: Array.from({ length: 22 }, () => hours(8)),
      rates: [cappedRates[0]],
    });
    expect(result.capped).toBe(false);
    expect(result.extendedTotal.toNumber()).toBe(9020);
  });
});

describe("calculateProjectRow honors the account's defaultHours", () => {
  it("a 9-hour cell is a full day at defaultHours 8 but a partial day at 10", () => {
    const at8 = calculateProjectRow({ defaultHours: 8, band: 2, entries: [hours(9)], rates });
    expect(at8.daysWorked.toNumber()).toBe(1);
    expect(at8.extendedTotal.toNumber()).toBe(420);

    const at10 = calculateProjectRow({ defaultHours: 10, band: 2, entries: [hours(9)], rates });
    expect(at10.daysWorked.toNumber()).toBe(0.9); // 9 / 10
    expect(at10.extendedTotal.toNumber()).toBe(378); // 0.9 x 420
  });
});
