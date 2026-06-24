import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import {
  calculateDispatchVisit,
  type DispatchRateRow,
  type DispatchVisitInput,
} from "@/lib/invoice/dispatch-calculator";
import { TCS_PRIORITY_PROFILE } from "@/lib/invoice/dispatch-pricing-profiles";

const Decimal = Prisma.Decimal;
const dec = (n: number | string) => new Decimal(n);

// TCS (Hertz) rate card. First-hour charge varies by PRIORITY (stored as the SLA
// dimension); additional-hour rate varies by SCENARIO (uniform across priorities).
// Band is irrelevant in the priority model, so it is set to 2 here arbitrarily.
const PRIORITIES = ["P1", "P2", "P3", "P4", "MACD"] as const;
const FIRST_HOUR: Record<string, number> = { P1: 234, P2: 117, P3: 108, P4: 90, MACD: 60 };

function rate(sla: string, code: string, amount: number): DispatchRateRow {
  return { rateAmount: dec(amount), band: 2, rateSubCategory: { code }, sla: { code: sla } };
}

const rates: DispatchRateRow[] = [
  ...PRIORITIES.map((p) => rate(p, "FIRST_HOUR", FIRST_HOUR[p])),
  // Scenario additional-hour rates, same across priorities (per the TCS rate card).
  ...PRIORITIES.flatMap((p) => [
    rate(p, "ADDITIONAL_HOUR", 60), // Business (8-5)
    rate(p, "ADDITIONAL_HOUR_OOB", 90), // After business hours
    rate(p, "ADDITIONAL_HOUR_WEEKEND", 120), // Weekend business
    rate(p, "ADDITIONAL_HOUR_WEEKEND_OOB", 180), // Weekend after hours
  ]),
];

const baseVisit: DispatchVisitInput = {
  id: "v",
  visitDate: new Date(Date.UTC(2026, 3, 1)),
  ticketNumber: null,
  hoursOnSite: dec(1),
  afterHours: false,
  weekend: false,
  isPublicHoliday: false,
  slaCode: "P3",
  technicianName: "Tech",
  technicianBand: 2,
  location: "",
  notes: null,
};

const calc = (priority: string, onsite: number, over: Partial<DispatchVisitInput> = {}) =>
  calculateDispatchVisit(
    { ...baseVisit, slaCode: priority, hoursOnSite: dec(onsite), ...over },
    rates,
    TCS_PRIORITY_PROFILE,
  );

// Every row of the user's TCS-Hertz April 2026 tracker: [ticket, priority,
// onsite hours, expected Billed]. The cancelled P2 (0h) bills the first-hour
// cancellation fee. Sum of Billed = 4,203.00 (the oracle).
const ROWS: [string, string, number, number][] = [
  ["009615", "P3", 1.0333, 108],
  ["009656", "P3", 1.1333, 108],
  ["009657", "P3", 1.5167, 108],
  ["009687", "P3", 0.85, 108],
  ["009829", "P3", 2.3167, 138],
  ["009839", "P3", 1.7667, 108],
  ["009865", "P3", 2.3, 138],
  ["009860", "P3", 3.0, 168],
  ["009969", "P3", 2.1833, 108],
  ["010018", "MACD", 2.1667, 60],
  ["010054", "P3", 1.7333, 108],
  ["010014", "P3", 2.05, 108],
  ["010051", "P3", 2.9667, 168],
  ["010100", "P3", 5.4667, 318],
  ["010247", "P1", 1.05, 234],
  ["010242", "P3", 2.35, 138],
  ["010248", "P3", 1.3667, 108],
  ["010338", "P1", 1.75, 234],
  ["19012772", "P2", 0, 117], // cancelled -> first-hour cancellation fee
  ["010305", "P3", 2.3667, 138],
  ["010342", "P3", 0.85, 108],
  ["010377", "P3", 0.55, 108],
  ["010382", "P3", 3.1, 168],
  ["010420", "P3", 3.3, 198],
  ["010378", "P3", 1.9, 108],
  ["010542", "P3", 2.8167, 168],
  ["010543", "P3", 1.8167, 108],
  ["010531", "P3", 0.6833, 108],
  ["010641", "P3", 3.25, 198],
  ["010668", "P3", 2.05, 108],
];

describe("calculateDispatchVisit (TCS priority model)", () => {
  it.each(ROWS)("%s (%s, %f h) bills $%d", (_ticket, priority, onsite, expected) => {
    expect(calc(priority, onsite).charge).toBe(expected);
  });

  it("the 30 rows sum to the $4,203.00 oracle", () => {
    const total = ROWS.reduce((n, [, p, h]) => n + calc(p, h).charge, 0);
    expect(total).toBe(4203);
  });

  it("first-hour charge covers the first 2 hours (P3, 2.0 h = 108)", () => {
    expect(calc("P3", 2.0).charge).toBe(108);
  });

  it("rounds onsite hours to the nearest 0.5 with a 1.0 minimum", () => {
    expect(calc("P3", 0.55).hoursOnSite).toBe(1); // 0.55 -> 0.5 -> floored to 1
    expect(calc("P3", 1.7333).hoursOnSite).toBe(1.5); // nearest 0.5
    expect(calc("P3", 3.25).hoursOnSite).toBe(3.5); // .25 ties round up
    expect(calc("P3", 0).hoursOnSite).toBe(1); // cancelled / 0h -> min 1
  });

  it("each priority resolves its own first-hour charge", () => {
    expect(calc("P1", 1).charge).toBe(234);
    expect(calc("P2", 1).charge).toBe(117);
    expect(calc("P3", 1).charge).toBe(108);
    expect(calc("P4", 1).charge).toBe(90);
    expect(calc("MACD", 1).charge).toBe(60);
  });

  // The following scenario paths come from the TCS rate card but are NOT exercised
  // by the April dataset (no weekend / after-hours rows). They guard the wiring.
  it("weekday after-hours uses the OOB additional rate, first hour unmultiplied (P3, 3h)", () => {
    // 108 + (3-2) x 90 = 198
    expect(calc("P3", 3, { afterHours: true }).charge).toBe(198);
  });

  it("weekend business: first hour x1.5 + weekend additional (P3, 3h)", () => {
    // 108 x 1.5 + (3-2) x 120 = 162 + 120 = 282
    expect(calc("P3", 3, { weekend: true }).charge).toBe(282);
  });

  it("weekend after-hours: first hour x2 + weekend-after additional (P3, 3h)", () => {
    // 108 x 2 + (3-2) x 180 = 216 + 180 = 396
    expect(calc("P3", 3, { weekend: true, afterHours: true }).charge).toBe(396);
  });
});
