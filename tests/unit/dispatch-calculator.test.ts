import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import {
  calculateDispatchVisit,
  type DispatchRateRow,
  type DispatchVisitInput,
} from "@/lib/invoice/dispatch-calculator";

const Decimal = Prisma.Decimal;
const dec = (n: number | string) => new Decimal(n);

const baseVisit: DispatchVisitInput = {
  id: "v1",
  visitDate: new Date(Date.UTC(2026, 2, 9)), // Mon 2026-03-09
  ticketNumber: "INC-1",
  hoursOnSite: dec(1),
  afterHours: false,
  weekend: false,
  isPublicHoliday: false,
  slaCode: "NBD",
  technicianName: "Todd A.",
  technicianBand: 2,
  location: "Mankato, MN",
  notes: null,
};

// US dispatch pricing from the JLL sheet: first hour (SLA) 90, T&M hourly 65,
// full-day cap 410, OOBH 1.5x, weekend/PH 2.0x.
const rates: DispatchRateRow[] = [
  { rateAmount: dec(90), band: 2, rateSubCategory: { code: "FIRST_HOUR" }, sla: { code: "NBD" } },
  { rateAmount: dec(65), band: 2, rateSubCategory: { code: "ADDITIONAL_HOUR" }, sla: { code: "NBD" } },
  { rateAmount: dec(410), band: 2, rateSubCategory: { code: "FULL_DAY" }, sla: { code: "NBD" } },
  { rateAmount: dec(1.5), band: 2, rateSubCategory: { code: "OOBH_MULTIPLIER" }, sla: { code: "NBD" } },
  { rateAmount: dec(2), band: 2, rateSubCategory: { code: "WEEKEND_PH_MULTIPLIER" }, sla: { code: "NBD" } },
];

describe("calculateDispatchVisit (JLL model)", () => {
  it("1-hour visit = first-hour rate (90)", () => {
    expect(calculateDispatchVisit(baseVisit, rates).charge).toBe(90);
  });

  it("3-hour visit = 90 + 2 x 65 = 220", () => {
    expect(calculateDispatchVisit({ ...baseVisit, hoursOnSite: dec(3) }, rates).charge).toBe(220);
  });

  it("5.2-hour visit = 90 + 4.2 x 65 = 363 (matches Izuazu)", () => {
    expect(calculateDispatchVisit({ ...baseVisit, hoursOnSite: dec(5.2) }, rates).charge).toBe(363);
  });

  it("8-hour visit caps at the full-day rate (545 -> 410)", () => {
    const r = calculateDispatchVisit({ ...baseVisit, hoursOnSite: dec(8) }, rates);
    expect(r.charge).toBe(410);
    expect(r.modifiersApplied).toContain("full-day cap");
  });

  it("weekend 8-hour = capped 410 x 2.0 = 820", () => {
    const r = calculateDispatchVisit({ ...baseVisit, hoursOnSite: dec(8), weekend: true }, rates);
    expect(r.charge).toBe(820);
    expect(r.modifiersApplied.some((m) => m.startsWith("weekend"))).toBe(true);
  });

  it("after-hours 3-hour = 220 x 1.5 = 330", () => {
    const r = calculateDispatchVisit({ ...baseVisit, hoursOnSite: dec(3), afterHours: true }, rates);
    expect(r.charge).toBe(330);
    expect(r.modifiersApplied.some((m) => m.startsWith("after-hours"))).toBe(true);
  });

  it("public holiday 3-hour = 220 x 2.0 = 440", () => {
    const r = calculateDispatchVisit({ ...baseVisit, hoursOnSite: dec(3), isPublicHoliday: true }, rates);
    expect(r.charge).toBe(440);
    expect(r.modifiersApplied.some((m) => m.startsWith("public-holiday"))).toBe(true);
  });

  it("weekend/PH takes precedence over OOBH (no stacking): 3-hour weekend+OOBH = 440, not 660", () => {
    const r = calculateDispatchVisit(
      { ...baseVisit, hoursOnSite: dec(3), afterHours: true, weekend: true },
      rates,
    );
    expect(r.charge).toBe(440); // 220 x 2.0, OOBH ignored
  });

  it("uses default multipliers (2.0 / 1.5) when the rate sheet omits them", () => {
    const noMultipliers = rates.filter(
      (r) => !["OOBH_MULTIPLIER", "WEEKEND_PH_MULTIPLIER"].includes(r.rateSubCategory.code),
    );
    // 2-hour weekend: base 90 + 65 = 155, x default 2.0 = 310.
    const wknd = calculateDispatchVisit({ ...baseVisit, hoursOnSite: dec(2), weekend: true }, noMultipliers);
    expect(wknd.charge).toBe(310);
    // 2-hour after-hours: 155 x default 1.5 = 232.5.
    const oobh = calculateDispatchVisit({ ...baseVisit, hoursOnSite: dec(2), afterHours: true }, noMultipliers);
    expect(oobh.charge).toBe(232.5);
  });

  it("missing rate falls back to zero", () => {
    expect(calculateDispatchVisit(baseVisit, []).charge).toBe(0);
  });

  it("0.5-hour visit = first hour only (no additional)", () => {
    expect(calculateDispatchVisit({ ...baseVisit, hoursOnSite: dec(0.5) }, rates).charge).toBe(90);
  });
});

describe("flat per-ticket pricing", () => {
  const perTicketRates: DispatchRateRow[] = [
    ...rates,
    { rateAmount: dec(250), band: 2, rateSubCategory: { code: "PER_TICKET" }, sla: { code: "NBD" } },
  ];

  it("PER_TICKET bills a flat amount regardless of hours, bypassing cap + multipliers", () => {
    const oneHour = calculateDispatchVisit(baseVisit, perTicketRates);
    const fiveHours = calculateDispatchVisit({ ...baseVisit, hoursOnSite: dec(5), weekend: true }, perTicketRates);
    expect(oneHour.charge).toBe(250);
    expect(fiveHours.charge).toBe(250);
    expect(fiveHours.modifiersApplied).toContain("per-ticket");
  });

  it("falls back to hourly when no PER_TICKET rate exists for the band/SLA", () => {
    const result = calculateDispatchVisit({ ...baseVisit, hoursOnSite: dec(3) }, rates);
    expect(result.charge).toBe(220);
  });
});
