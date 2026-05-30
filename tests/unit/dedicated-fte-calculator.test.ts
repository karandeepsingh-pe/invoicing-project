import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import {
  calculateDedicatedFteRow,
  computeDaysWorked,
  type RateRow,
  type TimesheetCell,
} from "@/lib/invoice/dedicated-fte-calculator";
import { isWeekendUtc } from "@/lib/invoice/hours-split";

const Decimal = Prisma.Decimal;

function dec(n: number | string): InstanceType<typeof Decimal> {
  return new Decimal(n);
}

function utc(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d));
}

/** Generate April 2026 weekday dates (Mon–Fri only). */
function aprilWeekdays(): Date[] {
  const out: Date[] = [];
  for (let d = 1; d <= 30; d++) {
    const date = utc(2026, 4, d);
    if (!isWeekendUtc(date)) out.push(date);
  }
  return out;
}

function workedCell(date: Date, h: number): TimesheetCell {
  return { date, hours: dec(h), status: null };
}
function statusCell(
  date: Date,
  status: "PH" | "AB" | "NA",
): TimesheetCell {
  return { date, hours: dec(0), status };
}

// Model B: rate-sheet MONTHLY_DAY_RATE row holds a per-DAY rate. Extended =
// dayRate × daysWorked + OT/weekend hours × their rates. businessDays is
// informational only — it does NOT scale the FTE portion.
const rates: RateRow[] = [
  {
    rateAmount: dec(250),
    rateSubCategory: { code: "MONTHLY_DAY_RATE" },
    sla: { code: "BACKFILL" },
  },
  {
    rateAmount: dec(200),
    rateSubCategory: { code: "MONTHLY_DAY_RATE" },
    sla: { code: "NO_BACKFILL" },
  },
  {
    rateAmount: dec(75),
    rateSubCategory: { code: "OT_HOURLY_RATE" },
    sla: { code: "BACKFILL" },
  },
  {
    rateAmount: dec(100),
    rateSubCategory: { code: "WEEKEND_HOURLY_RATE" },
    sla: { code: "BACKFILL" },
  },
];

describe("computeDaysWorked (legacy, used by Project flow)", () => {
  it("counts full 8h cells as 1.0 (no date awareness)", () => {
    const result = computeDaysWorked(
      [
        { hours: dec(8), status: null },
        { hours: dec(8), status: null },
        { hours: dec(8), status: null },
      ],
      8,
    );
    expect(result.toNumber()).toBeCloseTo(3, 6);
  });

  it("PH/AB/NA cells skipped", () => {
    const result = computeDaysWorked(
      [
        { hours: dec(8), status: null },
        { hours: dec(0), status: "PH" },
        { hours: dec(0), status: "AB" },
        { hours: dec(0), status: "NA" },
      ],
      8,
    );
    expect(result.toNumber()).toBeCloseTo(1, 6);
  });
});

describe("calculateDedicatedFteRow", () => {
  // 22 weekdays in April 2026; PH is a paid day, so a month with 1 PH bills 22.
  const weekdays = aprilWeekdays();
  expect(weekdays.length).toBe(22);

  it("full month (21 worked + 1 PH paid) = dayRate × 22", () => {
    const entries: TimesheetCell[] = weekdays.map((d, i) =>
      i === 0 ? statusCell(d, "PH") : workedCell(d, 8),
    );
    const result = calculateDedicatedFteRow({
      defaultHours: 8,
      businessDays: 22,
      entries,
      rates,
      slaTier: "BACKFILL",
    });
    expect(result.daysWorked.toNumber()).toBe(22);
    expect(result.otHours.toNumber()).toBe(0);
    expect(result.weekendHours.toNumber()).toBe(0);
    expect(result.dayRate.toNumber()).toBe(250);
    expect(result.extendedTotal.toNumber()).toBeCloseTo(250 * 22, 2);
  });

  it("partial month: 20 worked + 1 AB + 1 PH(paid) = dayRate × 21", () => {
    const entries: TimesheetCell[] = weekdays.map((d, i) => {
      if (i === 0) return statusCell(d, "PH");
      if (i === 1) return statusCell(d, "AB");
      return workedCell(d, 8);
    });
    const result = calculateDedicatedFteRow({
      defaultHours: 8,
      businessDays: 22,
      entries,
      rates,
      slaTier: "BACKFILL",
    });
    expect(result.daysWorked.toNumber()).toBe(21);
    expect(result.extendedTotal.toNumber()).toBeCloseTo(250 * 21, 2);
  });

  it("holiday worked: a PH date overridden with 10h bills 1 day + 2 OT, not a paid PH day", () => {
    // The tech works the holiday: that cell holds hours, not PH.
    const entries: TimesheetCell[] = weekdays.map((d) => workedCell(d, 8));
    entries[0] = workedCell(weekdays[0], 10);
    const result = calculateDedicatedFteRow({
      defaultHours: 8,
      businessDays: 22,
      entries,
      rates,
      slaTier: "BACKFILL",
    });
    expect(result.daysWorked.toNumber()).toBe(22); // 21 at 8h + 1 regular from the 10h
    expect(result.otHours.toNumber()).toBe(2);
    expect(result.extendedTotal.toNumber()).toBeCloseTo(250 * 22 + 2 * 75, 2);
  });

  it("terminated tech: 6 worked + 16 NA = dayRate × 6", () => {
    const entries: TimesheetCell[] = weekdays.map((d, i) =>
      i < 6 ? workedCell(d, 8) : statusCell(d, "NA"),
    );
    const result = calculateDedicatedFteRow({
      defaultHours: 8,
      businessDays: 21,
      entries,
      rates,
      slaTier: "BACKFILL",
    });
    expect(result.daysWorked.toNumber()).toBe(6);
    expect(result.extendedTotal.toNumber()).toBeCloseTo(250 * 6, 2);
  });

  it("derives OT from a 10h weekday cell", () => {
    const entries: TimesheetCell[] = weekdays.map((d, i) => {
      if (i === 0) return statusCell(d, "PH");
      if (i === 1) return workedCell(d, 10); // 1 day + 2 OT
      return workedCell(d, 8);
    });
    const result = calculateDedicatedFteRow({
      defaultHours: 8,
      businessDays: 21,
      entries,
      rates,
      slaTier: "BACKFILL",
    });
    expect(result.daysWorked.toNumber()).toBe(22);
    expect(result.otHours.toNumber()).toBe(2);
    expect(result.otPortion.toNumber()).toBeCloseTo(2 * 75, 2);
    expect(result.extendedTotal.toNumber()).toBeCloseTo(250 * 22 + 2 * 75, 2);
  });

  it("derives weekend hours from a Sat 8h cell", () => {
    const sat = utc(2026, 4, 4); // Sat
    const entries: TimesheetCell[] = [
      ...weekdays.map((d, i) =>
        i === 0 ? statusCell(d, "PH") : workedCell(d, 8),
      ),
      workedCell(sat, 8),
    ];
    const result = calculateDedicatedFteRow({
      defaultHours: 8,
      businessDays: 21,
      entries,
      rates,
      slaTier: "BACKFILL",
    });
    expect(result.weekendHours.toNumber()).toBe(8);
    expect(result.weekendPortion.toNumber()).toBe(800);
    expect(result.extendedTotal.toNumber()).toBeCloseTo(250 * 22 + 800, 2);
  });

  it("missing rate falls back to zero", () => {
    const entries: TimesheetCell[] = weekdays.map((d, i) =>
      i === 0 ? statusCell(d, "PH") : workedCell(d, 8),
    );
    const result = calculateDedicatedFteRow({
      defaultHours: 8,
      businessDays: 21,
      entries,
      rates: [],
      slaTier: "BACKFILL",
    });
    expect(result.dayRate.toNumber()).toBe(0);
    expect(result.extendedTotal.toNumber()).toBe(0);
  });

  it("businessDays does NOT scale the FTE portion (Model B)", () => {
    // Even with businessDays=0, a worked day still bills one day rate.
    const result = calculateDedicatedFteRow({
      defaultHours: 8,
      businessDays: 0,
      entries: [workedCell(weekdays[0], 8)],
      rates,
      slaTier: "BACKFILL",
    });
    expect(result.daysWorked.toNumber()).toBe(1);
    expect(result.daysWorkedPortion.toNumber()).toBeCloseTo(250, 2);
  });

  it("NO_BACKFILL tier picks the lower rate row", () => {
    const entries: TimesheetCell[] = weekdays.map((d, i) =>
      i === 0 ? statusCell(d, "PH") : workedCell(d, 8),
    );
    const result = calculateDedicatedFteRow({
      defaultHours: 8,
      businessDays: 21,
      entries,
      rates,
      slaTier: "NO_BACKFILL",
    });
    expect(result.dayRate.toNumber()).toBe(200);
    expect(result.extendedTotal.toNumber()).toBeCloseTo(200 * 22, 2);
  });

  it("coverageDaysDelta subtracts from covered tech", () => {
    const entries: TimesheetCell[] = weekdays.map((d, i) =>
      i === 0 ? statusCell(d, "PH") : workedCell(d, 8),
    );
    const result = calculateDedicatedFteRow({
      defaultHours: 8,
      businessDays: 21,
      entries,
      rates,
      slaTier: "BACKFILL",
      coverageDaysDelta: dec(-1),
    });
    expect(result.daysWorked.toNumber()).toBe(21);
    expect(result.extendedTotal.toNumber()).toBeCloseTo(250 * 21, 2);
  });

  it("coverage OT + override rates bill at covered tech's rates", () => {
    // Covering tech has no own entries; coverage gives +1 day, +2 OT.
    const result = calculateDedicatedFteRow({
      defaultHours: 8,
      businessDays: 21,
      entries: [],
      rates: [
        {
          rateAmount: dec(200),
          rateSubCategory: { code: "MONTHLY_DAY_RATE" },
          sla: { code: "NO_BACKFILL" },
        },
      ],
      slaTier: "NO_BACKFILL",
      overrideDayRate: dec(250),
      overrideOtRate: dec(75),
      overrideWeekendRate: dec(100),
      coverageDaysDelta: dec(1),
      coverageOtDelta: dec(2),
    });
    expect(result.daysWorked.toNumber()).toBe(1);
    expect(result.otHours.toNumber()).toBe(2);
    expect(result.daysWorkedPortion.toNumber()).toBeCloseTo(250, 2);
    expect(result.otPortion.toNumber()).toBeCloseTo(150, 2);
    expect(result.extendedTotal.toNumber()).toBeCloseTo(250 + 150, 2);
  });
});
