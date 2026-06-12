// Tests for the 2026-06-13 billing-gap features: manual cancellation charges,
// overnight (Out ≤ In) dispatch visits, and hourly scheduled visits.

import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import {
  bulkDispatchRowSchema,
  hoursBetween,
} from "@/lib/schemas/bulk-dispatch-upload";
import { dispatchVisitCreateSchema } from "@/lib/schemas/dispatch-visit";
import { bookingEnvelope } from "@/lib/domain/booking-overlap";
import {
  calculateDispatchVisit,
  type DispatchRateRow,
  type DispatchVisitInput,
} from "@/lib/invoice/dispatch-calculator";
import {
  calculateScheduledRow,
  type ScheduledRateRow,
} from "@/lib/invoice/scheduled-calculator";
import { bulkScheduledRowSchema } from "@/lib/schemas/bulk-scheduled-upload";

const Decimal = Prisma.Decimal;
const dec = (n: number | string) => new Decimal(n);

// ── Overnight dispatch ──────────────────────────────────────────────────────

const SLA = "8X5X4";
const WINDOW = { start: "09:00", end: "17:00" };
const dispatchRates: DispatchRateRow[] = [
  { rateAmount: dec(90), band: 2, rateSubCategory: { code: "FIRST_HOUR" }, sla: { code: SLA } },
  { rateAmount: dec(65), band: 2, rateSubCategory: { code: "ADDITIONAL_HOUR" }, sla: { code: SLA } },
  { rateAmount: dec(120), band: 2, rateSubCategory: { code: "FIRST_HOUR_OOB" }, sla: { code: SLA } },
  { rateAmount: dec(80), band: 2, rateSubCategory: { code: "ADDITIONAL_HOUR_OOB" }, sla: { code: SLA } },
];

const baseVisit: DispatchVisitInput = {
  id: "v1",
  visitDate: new Date(Date.UTC(2026, 2, 9)), // Mon (weekday)
  ticketNumber: "INC-1",
  hoursOnSite: dec(1),
  afterHours: false,
  weekend: false,
  isPublicHoliday: false,
  slaCode: SLA,
  technicianName: "Todd A.",
  technicianBand: 2,
  location: "",
  notes: null,
};

describe("overnight dispatch (Out ≤ In crosses midnight)", () => {
  it("hoursBetween wraps: 22:00 → 01:30 = 3.5h", () => {
    expect(hoursBetween("22:00", "01:30")).toBeCloseTo(3.5, 2);
    expect(hoursBetween("09:12", "12:10")).toBeCloseTo(2.97, 2);
  });

  it("bookingEnvelope ends on the next day", () => {
    const env = bookingEnvelope("2026-03-09", "22:00", "01:30");
    expect(env.start.toISOString()).toBe("2026-03-09T22:00:00.000Z");
    expect(env.end.toISOString()).toBe("2026-03-10T02:00:00.000Z"); // ceil to 02:00 next day
  });

  it("all post-window + post-midnight hours bill OOO: 22:00–01:30 (3.5h) = 120 + 2.5×80 = 320", () => {
    const r = calculateDispatchVisit(
      { ...baseVisit, hoursOnSite: dec(3.5), inTime: "22:00", outTime: "01:30", businessWindow: WINDOW },
      dispatchRates,
    );
    expect(r.charge).toBe(320);
  });

  it("16:00–01:00 (9h): 1 business hour + 8 OOO = 90 + 8×80 = 730", () => {
    const r = calculateDispatchVisit(
      { ...baseVisit, hoursOnSite: dec(9), inTime: "16:00", outTime: "01:00", businessWindow: WINDOW },
      dispatchRates,
    );
    expect(r.charge).toBe(730);
  });

  it("the form schema accepts Out ≤ In", () => {
    const res = dispatchVisitCreateSchema.safeParse({
      assignmentId: "a1",
      visitDate: "2026-03-09",
      hoursOnSite: "3.5",
      slaId: "s1",
      inTime: "22:00",
      outTime: "01:30",
      afterHours: false,
      weekend: false,
      override: false,
    });
    expect(res.success).toBe(true);
  });
});

// ── Cancellation charge ─────────────────────────────────────────────────────

describe("cancellation charge validation", () => {
  const cancelledRow = (over: Record<string, string>) => ({
    technician: "Jane Doe",
    visitDate: "2026-06-03",
    ticketNumber: "INC1",
    slaCode: "NBD",
    visitType: "",
    workStatus: "Cancelled",
    cancellationCharge: "",
    inTime: "",
    outTime: "",
    totalHours: "0",
    oooHrs: "",
    afterHours: "",
    weekend: "",
    siteCode: "",
    siteLocation: "",
    zipcode: "",
    city: "",
    state: "",
    country: "",
    requestReceivedDate: "",
    proposedOnsiteDate: "",
    visitTime: "",
    travelHours: "",
    travelMiles: "",
    partsAmount: "",
    reimbursementNotes: "",
    notes: "",
    overrideConflict: "",
    overrideReason: "",
    ...over,
  });

  it("bulk row accepts a charge on a Cancelled visit", () => {
    const r = bulkDispatchRowSchema.parse(cancelledRow({ cancellationCharge: "54" }));
    expect(r.cancellationCharge).toBe(54);
    expect(r.workStatus).toBe("CANCELLED");
  });

  it("bulk row rejects a charge on a Completed visit", () => {
    const res = bulkDispatchRowSchema.safeParse(
      cancelledRow({ workStatus: "Completed", cancellationCharge: "54", totalHours: "2" }),
    );
    expect(res.success).toBe(false);
  });

  it("form schema enforces the same rule", () => {
    const base = {
      assignmentId: "a1",
      visitDate: "2026-06-03",
      hoursOnSite: "0",
      slaId: "s1",
      afterHours: false,
      weekend: false,
      override: false,
    };
    expect(
      dispatchVisitCreateSchema.safeParse({
        ...base,
        workStatus: "CANCELLED",
        cancellationCharge: "54",
      }).success,
    ).toBe(true);
    expect(
      dispatchVisitCreateSchema.safeParse({
        ...base,
        workStatus: "COMPLETED",
        cancellationCharge: "54",
      }).success,
    ).toBe(false);
  });
});

// ── Hourly scheduled visits ─────────────────────────────────────────────────

const schedRates = (withHourly: boolean): ScheduledRateRow[] => [
  { rateAmount: dec(585), band: 2, rateSubCategory: { code: "FULL_DAY" }, sla: { code: "SCHEDULE" } },
  { rateAmount: dec(300), band: 2, rateSubCategory: { code: "HALF_DAY" }, sla: { code: "SCHEDULE" } },
  ...(withHourly
    ? [
        { rateAmount: dec(75), band: 2, rateSubCategory: { code: "HOURLY_BUSINESS" }, sla: { code: "SCHEDULE" } },
        { rateAmount: dec(110), band: 2, rateSubCategory: { code: "HOURLY_WEEKEND" }, sla: { code: "SCHEDULE" } },
      ]
    : []),
];

describe("hourly scheduled visits", () => {
  it("sub-default hours bill hourly when an hourly rate exists: 3h × 75 = 225", () => {
    const r = calculateScheduledRow({
      defaultHours: 8,
      band: 2,
      entries: [{ hours: dec(3), status: null, date: new Date(Date.UTC(2026, 4, 6)) }], // Wed
      rates: schedRates(true),
    });
    expect(r.hourlyHours.toNumber()).toBe(3);
    expect(r.extendedTotal.toNumber()).toBe(225);
    expect(r.halfDays).toBe(0);
  });

  it("weekend-dated hourly cells use the weekend hourly rate: 4h × 110 = 440", () => {
    const r = calculateScheduledRow({
      defaultHours: 8,
      band: 2,
      entries: [{ hours: dec(4), status: null, date: new Date(Date.UTC(2026, 4, 9)) }], // Sat
      rates: schedRates(true),
    });
    expect(r.weekendHourlyHours.toNumber()).toBe(4);
    expect(r.extendedTotal.toNumber()).toBe(440);
  });

  it("falls back to half-day when no hourly rate is set (back-compat)", () => {
    const r = calculateScheduledRow({
      defaultHours: 8,
      band: 2,
      entries: [{ hours: dec(3), status: null, date: new Date(Date.UTC(2026, 4, 6)) }],
      rates: schedRates(false),
    });
    expect(r.halfDays).toBe(1);
    expect(r.extendedTotal.toNumber()).toBe(300);
  });

  it("HALF_DAY status always bills the half-day rate, even with an hourly rate", () => {
    const r = calculateScheduledRow({
      defaultHours: 8,
      band: 2,
      entries: [{ hours: dec(0), status: "HALF_DAY", date: new Date(Date.UTC(2026, 4, 6)) }],
      rates: schedRates(true),
    });
    expect(r.halfDays).toBe(1);
    expect(r.extendedTotal.toNumber()).toBe(300);
  });

  it("bulk Day Type accepts an hour count", () => {
    const r = bulkScheduledRowSchema.parse({
      technician: "Jared Mattke",
      visitDate: "2026-05-08",
      dayType: "3",
      notes: "",
    });
    expect(r.dayType).toEqual({ kind: "HOURS", hours: 3 });
  });
});
