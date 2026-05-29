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
  visitDate: new Date(Date.UTC(2026, 3, 13)),
  ticketNumber: "INC-1",
  hoursOnSite: dec(1),
  afterHours: false,
  weekend: false,
  slaCode: "NBD",
  technicianName: "Todd A.",
  technicianBand: 2,
  location: "Mankato, MN",
  notes: null,
};

const rates: DispatchRateRow[] = [
  {
    rateAmount: dec(95),
    band: 2,
    rateSubCategory: { code: "FIRST_HOUR" },
    sla: { code: "NBD" },
  },
  {
    rateAmount: dec(60),
    band: 2,
    rateSubCategory: { code: "ADDITIONAL_HOUR" },
    sla: { code: "NBD" },
  },
  {
    rateAmount: dec(150),
    band: 2,
    rateSubCategory: { code: "OUT_OF_OFFICE" },
    sla: { code: "NBD" },
  },
  {
    rateAmount: dec(200),
    band: 2,
    rateSubCategory: { code: "WEEKEND" },
    sla: { code: "NBD" },
  },
];

describe("calculateDispatchVisit", () => {
  it("1-hour visit = FIRST_HOUR rate", () => {
    const result = calculateDispatchVisit(baseVisit, rates);
    expect(result.charge).toBe(95);
  });

  it("3-hour visit = FIRST_HOUR + 2 × ADDITIONAL_HOUR", () => {
    const result = calculateDispatchVisit(
      { ...baseVisit, hoursOnSite: dec(3) },
      rates,
    );
    expect(result.charge).toBe(95 + 60 * 2);
  });

  it("after-hours flag swaps in OUT_OF_OFFICE rate", () => {
    const result = calculateDispatchVisit(
      { ...baseVisit, hoursOnSite: dec(3), afterHours: true },
      rates,
    );
    // 150 (first hour) + 150 (2 add'l hours each at 150) = 150 + 300 = 450
    expect(result.charge).toBe(150 + 150 * 2);
    expect(result.modifiersApplied).toContain("after-hours");
  });

  it("weekend flag swaps in WEEKEND rate", () => {
    const result = calculateDispatchVisit(
      { ...baseVisit, hoursOnSite: dec(2), weekend: true },
      rates,
    );
    expect(result.charge).toBe(200 + 200 * 1);
    expect(result.modifiersApplied).toContain("weekend");
  });

  it("missing rate falls back to zero", () => {
    const result = calculateDispatchVisit(baseVisit, []);
    expect(result.charge).toBe(0);
  });

  it("0.5-hour visit = FIRST_HOUR only (no add'l)", () => {
    const result = calculateDispatchVisit(
      { ...baseVisit, hoursOnSite: dec(0.5) },
      rates,
    );
    expect(result.charge).toBe(95);
  });

  describe("flat per-ticket pricing", () => {
    const perTicketRates: DispatchRateRow[] = [
      ...rates,
      {
        rateAmount: dec(250),
        band: 2,
        rateSubCategory: { code: "PER_TICKET" },
        sla: { code: "NBD" },
      },
    ];

    it("PER_TICKET bills a flat amount regardless of hours", () => {
      const oneHour = calculateDispatchVisit(baseVisit, perTicketRates);
      const fiveHours = calculateDispatchVisit(
        { ...baseVisit, hoursOnSite: dec(5) },
        perTicketRates,
      );
      expect(oneHour.charge).toBe(250);
      expect(fiveHours.charge).toBe(250);
      expect(fiveHours.modifiersApplied).toContain("per-ticket");
    });

    it("PER_TICKET takes precedence over the first/additional-hour model", () => {
      const result = calculateDispatchVisit(
        { ...baseVisit, hoursOnSite: dec(3) },
        perTicketRates,
      );
      // Hourly would be 95 + 60*2 = 215; flat per-ticket wins at 250.
      expect(result.charge).toBe(250);
    });

    it("falls back to hourly when no PER_TICKET rate exists for the band/SLA", () => {
      const result = calculateDispatchVisit({ ...baseVisit, hoursOnSite: dec(3) }, rates);
      expect(result.charge).toBe(95 + 60 * 2);
    });
  });
});
