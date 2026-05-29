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
