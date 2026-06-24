import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import {
  calculateScheduledRow,
  type ScheduledRateRow,
  type ScheduledTimesheetCell,
} from "@/lib/invoice/scheduled-calculator";

const Decimal = Prisma.Decimal;
const dec = (n: number) => new Decimal(n);

// US scheduled pricing from the JLL sheet: Full Day 410, Half Day 260.
const rates: ScheduledRateRow[] = [
  { rateAmount: dec(410), band: 2, rateSubCategory: { code: "FULL_DAY" }, sla: { code: "SCHEDULE" } },
  { rateAmount: dec(260), band: 2, rateSubCategory: { code: "HALF_DAY" }, sla: { code: "SCHEDULE" } },
];

const full = (): ScheduledTimesheetCell => ({ hours: dec(8), status: null });
const na = (): ScheduledTimesheetCell => ({ hours: dec(0), status: "NA" });
const halfStatus = (): ScheduledTimesheetCell => ({ hours: dec(4), status: "HALF_DAY" });
const partial = (): ScheduledTimesheetCell => ({ hours: dec(4), status: null });

describe("calculateScheduledRow", () => {
  it("9 full days x 410 = 3,690 (matches Robert Hill); NA days ignored", () => {
    const entries = [...Array.from({ length: 9 }, full), ...Array.from({ length: 13 }, na)];
    const r = calculateScheduledRow({ defaultHours: 8, band: 2, entries, rates });
    expect(r.fullDays).toBe(9);
    expect(r.daysWorked.toNumber()).toBe(9);
    expect(r.extendedTotal.toNumber()).toBe(3690);
  });

  it("Half Day is its own rate, not half of Full Day: 2 full + 1 half = 1,080", () => {
    const r = calculateScheduledRow({
      defaultHours: 8,
      band: 2,
      entries: [full(), full(), halfStatus()],
      rates,
    });
    expect(r.fullDays).toBe(2);
    expect(r.halfDays).toBe(1);
    expect(r.daysWorked.toNumber()).toBe(2.5);
    expect(r.extendedTotal.toNumber()).toBe(2 * 410 + 260);
  });

  it("a partial null-status day bills the half-day rate", () => {
    const r = calculateScheduledRow({ defaultHours: 8, band: 2, entries: [partial()], rates });
    expect(r.halfDays).toBe(1);
    expect(r.extendedTotal.toNumber()).toBe(260);
  });

  it("PH / AB / NA / PTO count as zero", () => {
    const entries: ScheduledTimesheetCell[] = [
      { hours: dec(0), status: "PH" },
      { hours: dec(0), status: "AB" },
      { hours: dec(0), status: "NA" },
      { hours: dec(0), status: "PTO" },
    ];
    const r = calculateScheduledRow({ defaultHours: 8, band: 2, entries, rates });
    expect(r.daysWorked.toNumber()).toBe(0);
    expect(r.extendedTotal.toNumber()).toBe(0);
  });

  it("missing rate falls back to zero", () => {
    const r = calculateScheduledRow({ defaultHours: 8, band: 2, entries: [full()], rates: [] });
    expect(r.extendedTotal.toNumber()).toBe(0);
  });

  it("honors the account's defaultHours: a 9-hour day is full at 8, half at 10", () => {
    const nine = (): ScheduledTimesheetCell => ({ hours: dec(9), status: null });
    const at8 = calculateScheduledRow({ defaultHours: 8, band: 2, entries: [nine()], rates });
    expect(at8.fullDays).toBe(1);
    expect(at8.extendedTotal.toNumber()).toBe(410);

    const at10 = calculateScheduledRow({ defaultHours: 10, band: 2, entries: [nine()], rates });
    expect(at10.fullDays).toBe(0);
    expect(at10.halfDays).toBe(1);
    expect(at10.extendedTotal.toNumber()).toBe(260);
  });
});

describe("calculateScheduledRow weekend rates", () => {
  const weekendRates: ScheduledRateRow[] = [
    ...rates,
    { rateAmount: dec(600), band: 2, rateSubCategory: { code: "FULL_DAY_WEEKEND" }, sla: { code: "SCHEDULE" } },
    { rateAmount: dec(360), band: 2, rateSubCategory: { code: "HALF_DAY_WEEKEND" }, sla: { code: "SCHEDULE" } },
  ];
  const sat = new Date(Date.UTC(2026, 2, 7)); // Sat 2026-03-07
  const mon = new Date(Date.UTC(2026, 2, 9)); // Mon 2026-03-09
  const fullOn = (d: Date): ScheduledTimesheetCell => ({ hours: dec(8), status: null, date: d });

  it("weekend full day bills FULL_DAY_WEEKEND; weekday full day bills FULL_DAY", () => {
    const r = calculateScheduledRow({
      defaultHours: 8,
      band: 2,
      entries: [fullOn(mon), fullOn(sat)],
      rates: weekendRates,
    });
    expect(r.fullDays).toBe(1);
    expect(r.weekendFullDays).toBe(1);
    expect(r.extendedTotal.toNumber()).toBe(410 + 600);
  });

  it("weekend half day bills HALF_DAY_WEEKEND", () => {
    const r = calculateScheduledRow({
      defaultHours: 8,
      band: 2,
      entries: [{ hours: dec(4), status: null, date: sat }],
      rates: weekendRates,
    });
    expect(r.weekendHalfDays).toBe(1);
    expect(r.extendedTotal.toNumber()).toBe(360);
  });

  it("with NO weekend rate set, a weekend day bills the regular Full Day rate (back-compat)", () => {
    const r = calculateScheduledRow({ defaultHours: 8, band: 2, entries: [fullOn(sat)], rates });
    expect(r.fullDays).toBe(1);
    expect(r.weekendFullDays).toBe(0);
    expect(r.extendedTotal.toNumber()).toBe(410);
  });
});
