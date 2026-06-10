import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import {
  isWeekendUtc,
  splitCell,
  splitEntries,
  type DayCell,
} from "@/lib/invoice/hours-split";

const Decimal = Prisma.Decimal;
const dec = (n: number) => new Decimal(n);

function utc(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d));
}

// April 2026 reference dates
const TUE_APR_14 = utc(2026, 4, 14); // weekday
const FRI_APR_3 = utc(2026, 4, 3); // weekday
const SAT_APR_4 = utc(2026, 4, 4); // weekend
const SUN_APR_5 = utc(2026, 4, 5); // weekend

describe("isWeekendUtc", () => {
  it("flags Sat + Sun", () => {
    expect(isWeekendUtc(SAT_APR_4)).toBe(true);
    expect(isWeekendUtc(SUN_APR_5)).toBe(true);
    expect(isWeekendUtc(TUE_APR_14)).toBe(false);
  });
});

describe("splitCell", () => {
  it("weekday 10h with default 8 -> 1 day + 2 OT", () => {
    const s = splitCell({ date: TUE_APR_14, hours: dec(10), status: null }, 8);
    expect(s.regularDays.toNumber()).toBe(1);
    expect(s.otHours.toNumber()).toBe(2);
    expect(s.weekendHours.toNumber()).toBe(0);
  });

  it("weekday 6h -> 0.75 day + 0 OT", () => {
    const s = splitCell({ date: TUE_APR_14, hours: dec(6), status: null }, 8);
    expect(s.regularDays.toNumber()).toBe(0.75);
    expect(s.otHours.toNumber()).toBe(0);
  });

  it("weekday 8h -> 1 day + 0 OT", () => {
    const s = splitCell({ date: TUE_APR_14, hours: dec(8), status: null }, 8);
    expect(s.regularDays.toNumber()).toBe(1);
    expect(s.otHours.toNumber()).toBe(0);
  });

  it("Sat 8h -> 0 day, 0 OT, 8 weekend", () => {
    const s = splitCell({ date: SAT_APR_4, hours: dec(8), status: null }, 8);
    expect(s.regularDays.toNumber()).toBe(0);
    expect(s.otHours.toNumber()).toBe(0);
    expect(s.weekendHours.toNumber()).toBe(8);
  });

  it("AB/NA -> all zeros regardless of hours value", () => {
    const ab = splitCell({ date: TUE_APR_14, hours: dec(0), status: "AB" }, 8);
    const na = splitCell({ date: SAT_APR_4, hours: dec(8), status: "NA" }, 8);
    for (const s of [ab, na]) {
      expect(s.regularDays.toNumber()).toBe(0);
      expect(s.otHours.toNumber()).toBe(0);
      expect(s.weekendHours.toNumber()).toBe(0);
    }
  });

  it("PH (public holiday) -> 1 full paid day (defaultHours regular), billed", () => {
    const s = splitCell({ date: TUE_APR_14, hours: dec(0), status: "PH" }, 8);
    expect(s.regularDays.toNumber()).toBe(1);
    expect(s.regularHours.toNumber()).toBe(8);
    expect(s.otHours.toNumber()).toBe(0);
    expect(s.weekendHours.toNumber()).toBe(0);
  });

  it("PTO (paid time off) -> 0 billable (paid to tech, not billed to client)", () => {
    const s = splitCell({ date: TUE_APR_14, hours: dec(0), status: "PTO" }, 8);
    expect(s.regularDays.toNumber()).toBe(0);
    expect(s.regularHours.toNumber()).toBe(0);
    expect(s.otHours.toNumber()).toBe(0);
    expect(s.weekendHours.toNumber()).toBe(0);
  });

  it("HALF_DAY -> 0.5 day, no OT, no weekend", () => {
    const s = splitCell({ date: TUE_APR_14, hours: dec(0), status: "HALF_DAY" }, 8);
    expect(s.regularDays.toNumber()).toBe(0.5);
    expect(s.otHours.toNumber()).toBe(0);
    expect(s.weekendHours.toNumber()).toBe(0);
  });

  it("defaultHours = 7 (custom) treats 7h as full day", () => {
    const s = splitCell({ date: TUE_APR_14, hours: dec(9), status: null }, 7);
    expect(s.regularDays.toNumber()).toBeCloseTo(1, 6);
    expect(s.otHours.toNumber()).toBe(2);
  });

  it("rejects defaultHours <= 0", () => {
    expect(() =>
      splitCell({ date: TUE_APR_14, hours: dec(8), status: null }, 0),
    ).toThrow();
  });
});

describe("splitEntries", () => {
  it("mixed month: regular weekdays + PH + OT day + Sat weekend hours", () => {
    // Build April 2026 weekday-only baseline (Mon-Fri) at 8h each.
    const weekdayBaseline: DayCell[] = [];
    for (let d = 1; d <= 30; d++) {
      const date = utc(2026, 4, d);
      if (!isWeekendUtc(date)) {
        weekdayBaseline.push({ date, hours: dec(8), status: null });
      }
    }
    // April 2026 has 22 weekdays.
    expect(weekdayBaseline).toHaveLength(22);

    // Override Apr 3 with PH (was 8h baseline). Override Apr 14 with 10h.
    // Add one Sat 6h cell separately.
    const cells: DayCell[] = weekdayBaseline
      .map((c) => {
        if (c.date.getUTCDate() === 3) return { ...c, status: "PH" as const };
        if (c.date.getUTCDate() === 14) return { ...c, hours: dec(10) };
        return c;
      })
      .concat([{ date: SAT_APR_4, hours: dec(6), status: null }]);

    const totals = splitEntries(cells, 8);
    // 22 weekdays, all billed (PH bills as a paid day):
    //   20 at 8h = 20 regularDays; Apr 14 at 10h = +1 regularDay + 2 OT;
    //   Apr 3 PH = +1 paid day. Total regularDays = 22; OT = 2; Weekend = 6.
    expect(totals.regularDays.toNumber()).toBe(22);
    expect(totals.otHours.toNumber()).toBe(2);
    expect(totals.weekendHours.toNumber()).toBe(6);
  });

  it("half-day adds 0.5 to a full worked day", () => {
    const cells: DayCell[] = [
      { date: FRI_APR_3, hours: dec(8), status: null },
      { date: TUE_APR_14, hours: dec(0), status: "HALF_DAY" },
    ];
    const totals = splitEntries(cells, 8);
    expect(totals.regularDays.toNumber()).toBe(1.5);
    expect(totals.otHours.toNumber()).toBe(0);
    expect(totals.weekendHours.toNumber()).toBe(0);
  });

  it("empty array returns zeros", () => {
    const totals = splitEntries([], 8);
    expect(totals.regularDays.toNumber()).toBe(0);
    expect(totals.otHours.toNumber()).toBe(0);
    expect(totals.weekendHours.toNumber()).toBe(0);
  });
});
