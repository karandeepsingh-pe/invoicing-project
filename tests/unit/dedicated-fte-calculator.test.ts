import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import {
  calculateDedicatedFteRow,
  computeDaysWorked,
  type RateRow,
  type TimesheetCell,
} from "@/lib/invoice/dedicated-fte-calculator";
import { isWeekendUtc } from "@/lib/invoice/hours-split";
import { dedicatedDayRate } from "@/lib/invoice/billing-basis";
import { businessDaysInRange, monthRange } from "@/lib/invoice/period";

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
  status: "PH" | "AB" | "NA" | "PTO" | "HALF_DAY",
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
  // 22 weekdays in April 2026. PH credits 0 worked days — the client pays for
  // PH via the business-day denominator (PH excluded from businessDays raises
  // the day rate), so PH never appears in daysWorked.
  const weekdays = aprilWeekdays();
  expect(weekdays.length).toBe(22);

  it("full month (21 worked + 1 PH) = dayRate × 21 — PH credits 0", () => {
    const entries: TimesheetCell[] = weekdays.map((d, i) =>
      i === 0 ? statusCell(d, "PH") : workedCell(d, 8),
    );
    const result = calculateDedicatedFteRow({
      defaultHours: 8,
      businessDays: 21,
      entries,
      rates,
      slaTier: "BACKFILL",
    });
    expect(result.daysWorked.toNumber()).toBe(21);
    expect(result.otHours.toNumber()).toBe(0);
    expect(result.weekendHours.toNumber()).toBe(0);
    expect(result.dayRate.toNumber()).toBe(250);
    expect(result.extendedTotal.toNumber()).toBeCloseTo(250 * 21, 2);
  });

  it("partial month: 20 worked + 1 AB + 1 PH = dayRate × 20", () => {
    const entries: TimesheetCell[] = weekdays.map((d, i) => {
      if (i === 0) return statusCell(d, "PH");
      if (i === 1) return statusCell(d, "AB");
      return workedCell(d, 8);
    });
    const result = calculateDedicatedFteRow({
      defaultHours: 8,
      businessDays: 21,
      entries,
      rates,
      slaTier: "BACKFILL",
    });
    expect(result.daysWorked.toNumber()).toBe(20);
    expect(result.extendedTotal.toNumber()).toBeCloseTo(250 * 20, 2);
  });

  it("neither PH nor PTO credits days: 20 worked + 1 PTO + 1 PH = dayRate × 20", () => {
    // PTO is paid to the technician by Ovation but not charged to the client;
    // PH is billed through the business-day denominator, not as a day credit.
    const entries: TimesheetCell[] = weekdays.map((d, i) => {
      if (i === 0) return statusCell(d, "PH");
      if (i === 1) return statusCell(d, "PTO");
      return workedCell(d, 8);
    });
    const result = calculateDedicatedFteRow({
      defaultHours: 8,
      businessDays: 21,
      entries,
      rates,
      slaTier: "BACKFILL",
    });
    expect(result.daysWorked.toNumber()).toBe(20);
    expect(result.extendedTotal.toNumber()).toBeCloseTo(250 * 20, 2);
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
    // 20 at 8h + 1 at 10h (1 day + 2 OT); PH credits 0 = 21 billable days.
    expect(result.daysWorked.toNumber()).toBe(21);
    expect(result.otHours.toNumber()).toBe(2);
    expect(result.otPortion.toNumber()).toBeCloseTo(2 * 75, 2);
    expect(result.extendedTotal.toNumber()).toBeCloseTo(250 * 21 + 2 * 75, 2);
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
    // 21 worked (PH credits 0) = 21 billable days, + 8h weekend @ 100.
    expect(result.extendedTotal.toNumber()).toBeCloseTo(250 * 21 + 800, 2);
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
    // 21 worked (PH credits 0) = 21 billable days.
    expect(result.extendedTotal.toNumber()).toBeCloseTo(200 * 21, 2);
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
    // 21 worked (PH credits 0), minus 1 covered day = 20.
    expect(result.daysWorked.toNumber()).toBe(20);
    expect(result.extendedTotal.toNumber()).toBeCloseTo(250 * 20, 2);
  });

  // The covering side no longer rides this calculator: backfill lines are
  // synthesized in fte-rows from the coverage events at the covered seat's
  // rates (see coverage.test.ts). Only the covered-side day debit remains here.
});

describe("calculateDedicatedFteRow — annual-only basis", () => {
  const weekdays = aprilWeekdays();

  // The HOURLY per-tech basis is retired (2026-06-10): every Dedicated tech
  // bills days × the annual-derived day rate. These cases pin the day model.
  it("partial days pro-rate: 2h on an 8h day = 0.25 days", () => {
    const r = calculateDedicatedFteRow({
      defaultHours: 8, businessDays: 22,
      entries: [workedCell(weekdays[0], 8), workedCell(weekdays[1], 2)],
      rates, slaTier: "BACKFILL",
    });
    expect(r.daysWorked.toNumber()).toBe(1.25);
    expect(r.extendedTotal.toNumber()).toBeCloseTo(250 * 1.25, 2);
  });

  it("day model: 3 full days × 250 = 750", () => {
    const r = calculateDedicatedFteRow({
      defaultHours: 8, businessDays: 22,
      entries: [workedCell(weekdays[0], 8), workedCell(weekdays[1], 8), workedCell(weekdays[2], 8)],
      rates, slaTier: "BACKFILL",
    });
    expect(r.extendedTotal.toNumber()).toBeCloseTo(250 * 3, 2);
  });
});

describe("PH via business-day denominator (user oracle, 2026-06-12)", () => {
  // May 2026: 21 weekdays, 1 weekday PH (Memorial Day, May 25) -> 20 business
  // days. The client pays for PH through the higher day rate, never as a
  // visible day credit.
  function mayWeekdays(): Date[] {
    const out: Date[] = [];
    for (let d = 1; d <= 31; d++) {
      const date = utc(2026, 5, d);
      if (!isWeekendUtc(date)) out.push(date);
    }
    return out;
  }

  function ratesFor(dayRate: number): RateRow[] {
    return [
      {
        rateAmount: dec(dayRate),
        rateSubCategory: { code: "MONTHLY_DAY_RATE" },
        sla: { code: "NO_BACKFILL" },
      },
    ];
  }

  it("user oracle: monthly 5333 / 20 business days × 15.56 days = 4149.07", () => {
    const businessDays = businessDaysInRange(monthRange(2026, 5), [utc(2026, 5, 25)]);
    expect(businessDays).toBe(20);
    const dayRate = dedicatedDayRate(5333 * 12, businessDays);
    expect(dayRate).toBeCloseTo(266.65, 4);
    expect(Number((dayRate * 15.56).toFixed(2))).toBe(4149.07);
  });

  it("full attendance bills exactly the monthly: 20 non-PH weekdays worked = 5333", () => {
    const weekdays = mayWeekdays();
    expect(weekdays).toHaveLength(21);
    const ph = utc(2026, 5, 25);
    const businessDays = businessDaysInRange(monthRange(2026, 5), [ph]);
    const dayRate = dedicatedDayRate(5333 * 12, businessDays);
    const entries: TimesheetCell[] = weekdays.map((d) =>
      d.getUTCDate() === 25 ? statusCell(d, "PH") : workedCell(d, 8),
    );
    const r = calculateDedicatedFteRow({
      defaultHours: 8,
      businessDays,
      entries,
      rates: ratesFor(dayRate),
      slaTier: "NO_BACKFILL",
    });
    expect(r.daysWorked.toNumber()).toBe(20); // PH invisible in days worked
    expect(Number(r.extendedTotal.toFixed(2))).toBe(5333);
  });

  it("1 AB costs 1/20 of the monthly; business days unchanged", () => {
    const weekdays = mayWeekdays();
    const ph = utc(2026, 5, 25);
    const businessDays = businessDaysInRange(monthRange(2026, 5), [ph]);
    const dayRate = dedicatedDayRate(5333 * 12, businessDays);
    const entries: TimesheetCell[] = weekdays.map((d) => {
      if (d.getUTCDate() === 25) return statusCell(d, "PH");
      if (d.getUTCDate() === 4) return statusCell(d, "AB");
      return workedCell(d, 8);
    });
    const r = calculateDedicatedFteRow({
      defaultHours: 8,
      businessDays,
      entries,
      rates: ratesFor(dayRate),
      slaTier: "NO_BACKFILL",
    });
    expect(r.daysWorked.toNumber()).toBe(19);
    expect(Number(r.extendedTotal.toFixed(2))).toBe(Number(((5333 * 19) / 20).toFixed(2)));
  });
});
