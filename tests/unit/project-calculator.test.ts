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

// --- Rate-sheet-driven basis (Day / Weekly / Monthly) ---

describe("calculateProjectRow weekly basis (weekly rate × days/5)", () => {
  const weeklyRates: ProjectRateRow[] = [
    { rateAmount: dec(2000), band: 2, rateSubCategory: { code: "WEEKLY" }, sla: { code: "NA" } },
  ];

  it("8 days = 1.6 weeks → 3,200", () => {
    const r = calculateProjectRow({
      defaultHours: 8,
      band: 2,
      entries: Array.from({ length: 8 }, () => hours(8)),
      rates: weeklyRates,
    });
    expect(r.basis).toBe("weekly");
    expect(r.extendedTotal.toNumber()).toBe(3200);
  });

  it("a clean 5-day week bills exactly the weekly rate", () => {
    const r = calculateProjectRow({
      defaultHours: 8,
      band: 2,
      entries: Array.from({ length: 5 }, () => hours(8)),
      rates: weeklyRates,
    });
    expect(r.extendedTotal.toNumber()).toBe(2000);
  });

  it("weekly takes precedence over a day rate when both exist", () => {
    const r = calculateProjectRow({
      defaultHours: 8,
      band: 2,
      entries: Array.from({ length: 5 }, () => hours(8)),
      rates: [
        ...weeklyRates,
        { rateAmount: dec(410), band: 2, rateSubCategory: { code: "FULL_DAY" }, sla: { code: "NA" } },
      ],
    });
    expect(r.basis).toBe("weekly");
    expect(r.extendedTotal.toNumber()).toBe(2000);
  });
});

describe("calculateProjectRow monthly basis (pure monthly, pro-rated)", () => {
  const monthlyOnly: ProjectRateRow[] = [
    { rateAmount: dec(8800), band: 2, rateSubCategory: { code: "MONTHLY" }, sla: { code: "NA" } },
  ];

  it("a full month bills exactly the monthly rate (22/22 → 8,800)", () => {
    const r = calculateProjectRow({
      defaultHours: 8,
      band: 2,
      businessDays: 22,
      entries: Array.from({ length: 22 }, () => hours(8)),
      rates: monthlyOnly,
    });
    expect(r.basis).toBe("monthly");
    expect(r.extendedTotal.toNumber()).toBe(8800);
  });

  it("a partial month pro-rates by days/businessDays (6/22 → 2,400)", () => {
    const r = calculateProjectRow({
      defaultHours: 8,
      band: 2,
      businessDays: 22,
      entries: Array.from({ length: 6 }, () => hours(8)),
      rates: monthlyOnly,
    });
    expect(r.extendedTotal.toNumber()).toBe(2400);
  });

  it("matches the $1,976.19 pro-rate style (monthly 6,916.67 × 6/21)", () => {
    const r = calculateProjectRow({
      defaultHours: 8,
      band: 2,
      businessDays: 21,
      entries: Array.from({ length: 6 }, () => hours(8)),
      rates: [
        { rateAmount: dec(83000 / 12), band: 2, rateSubCategory: { code: "MONTHLY" }, sla: { code: "NA" } },
      ],
    });
    expect(r.extendedTotal.toNumber()).toBeCloseTo(1976.19, 2);
  });

  it("REGRESSION: a pure-monthly tech with no day rate must NOT bill $0", () => {
    const r = calculateProjectRow({
      defaultHours: 8,
      band: 2,
      businessDays: 22,
      entries: Array.from({ length: 10 }, () => hours(8)),
      rates: monthlyOnly,
    });
    expect(r.extendedTotal.toNumber()).toBe(4000); // 8,800 × 10/22
  });
});

describe("calculateProjectRow basis tagging", () => {
  it("day-rate-only is basis 'day'", () => {
    const r = calculateProjectRow({ defaultHours: 8, band: 2, entries: [hours(8)], rates });
    expect(r.basis).toBe("day");
  });

  it("no matching rate is basis 'unpriced' and 0", () => {
    const r = calculateProjectRow({ defaultHours: 8, band: 2, entries: [hours(8)], rates: [] });
    expect(r.basis).toBe("unpriced");
    expect(r.extendedTotal.toNumber()).toBe(0);
  });
});

describe("calculateProjectRow weekend day rates", () => {
  const dayRates: ProjectRateRow[] = [
    { rateAmount: dec(410), band: 2, rateSubCategory: { code: "FULL_DAY" }, sla: { code: "SCHEDULE" } },
  ];
  const weekendRates: ProjectRateRow[] = [
    ...dayRates,
    { rateAmount: dec(600), band: 2, rateSubCategory: { code: "FULL_DAY_WEEKEND" }, sla: { code: "SCHEDULE" } },
    { rateAmount: dec(360), band: 2, rateSubCategory: { code: "HALF_DAY_WEEKEND" }, sla: { code: "SCHEDULE" } },
  ];
  const sat = new Date(Date.UTC(2026, 2, 7)); // Sat 2026-03-07
  const mon = new Date(Date.UTC(2026, 2, 9)); // Mon 2026-03-09
  const fullOn = (d: Date): ProjectTimesheetCell => ({ hours: dec(8), status: null, date: d });

  it("weekend days bill the weekend rate on top of the weekday day basis", () => {
    // 2 weekday full days x 410 + 1 weekend full day x 600 = 820 + 600 = 1420.
    const r = calculateProjectRow({
      defaultHours: 8,
      band: 2,
      entries: [fullOn(mon), fullOn(mon), fullOn(sat)],
      rates: weekendRates,
    });
    expect(r.weekendDaysWorked.toNumber()).toBe(1);
    expect(r.weekendTotal.toNumber()).toBe(600);
    expect(r.extendedTotal.toNumber()).toBe(1420);
  });

  it("with no weekend rate set, a weekend day folds into the day basis (back-compat)", () => {
    const r = calculateProjectRow({
      defaultHours: 8,
      band: 2,
      entries: [fullOn(mon), fullOn(sat)],
      rates: dayRates,
    });
    expect(r.weekendTotal.toNumber()).toBe(0);
    expect(r.extendedTotal.toNumber()).toBe(820); // 2 x 410
  });

  it("only a weekend rate set bills the weekend day alone", () => {
    const r = calculateProjectRow({
      defaultHours: 8,
      band: 2,
      entries: [fullOn(sat)],
      rates: [weekendRates[1]],
    });
    expect(r.extendedTotal.toNumber()).toBe(600);
  });
});
