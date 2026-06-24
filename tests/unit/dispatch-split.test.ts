import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import {
  calculateDispatchVisit,
  type DispatchRateRow,
  type DispatchVisitInput,
} from "@/lib/invoice/dispatch-calculator";
import { STANDARD_PROFILE } from "@/lib/invoice/dispatch-pricing-profiles";

const Decimal = Prisma.Decimal;
const dec = (n: number | string) => new Decimal(n);

const SLA = "8X5X4";
const WINDOW = { start: "09:00", end: "17:00" };

// Explicit business / OOB / weekend rates (no multiplier on top).
const rates: DispatchRateRow[] = [
  { rateAmount: dec(90), band: 2, rateSubCategory: { code: "FIRST_HOUR" }, sla: { code: SLA } },
  { rateAmount: dec(65), band: 2, rateSubCategory: { code: "ADDITIONAL_HOUR" }, sla: { code: SLA } },
  { rateAmount: dec(120), band: 2, rateSubCategory: { code: "FIRST_HOUR_OOB" }, sla: { code: SLA } },
  { rateAmount: dec(80), band: 2, rateSubCategory: { code: "ADDITIONAL_HOUR_OOB" }, sla: { code: SLA } },
  { rateAmount: dec(150), band: 2, rateSubCategory: { code: "FIRST_HOUR_WEEKEND" }, sla: { code: SLA } },
  { rateAmount: dec(100), band: 2, rateSubCategory: { code: "ADDITIONAL_HOUR_WEEKEND" }, sla: { code: SLA } },
];

const base: DispatchVisitInput = {
  id: "v1",
  visitDate: new Date(Date.UTC(2026, 2, 9)), // Mon 2026-03-09 (weekday)
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

const v = (over: Partial<DispatchVisitInput>): DispatchVisitInput => ({ ...base, ...over });

describe("dispatch auto-split (band_sla, business-hours window)", () => {
  it("business-only weekday reduces to the legacy formula: 09:00–12:00 3h = 90 + 2×65 = 220", () => {
    const r = calculateDispatchVisit(
      v({ hoursOnSite: dec(3), inTime: "09:00", outTime: "12:00", businessWindow: WINDOW }),
      rates,
    );
    expect(r.charge).toBe(220);
  });

  it("spills into after-hours after 17:00: 15:00–19:00 4h = 90 + 1×65 + 2×80 = 315", () => {
    const r = calculateDispatchVisit(
      v({ hoursOnSite: dec(4), inTime: "15:00", outTime: "19:00", businessWindow: WINDOW }),
      rates,
    );
    expect(r.charge).toBe(315);
    expect(r.modifiersApplied).toContain("split business/after-hours");
  });

  it("starts before the window opens: 07:00–10:00 3h = 120 (first OOB) + 1×80 + 1×65 = 265", () => {
    const r = calculateDispatchVisit(
      v({ hoursOnSite: dec(3), inTime: "07:00", outTime: "10:00", businessWindow: WINDOW }),
      rates,
    );
    expect(r.charge).toBe(265);
  });

  it("weekend date bills the WHOLE visit at weekend rates (no split): 4h = 150 + 3×100 = 450", () => {
    const r = calculateDispatchVisit(
      v({ hoursOnSite: dec(4), inTime: "10:00", outTime: "14:00", weekend: true, businessWindow: WINDOW }),
      rates,
    );
    expect(r.charge).toBe(450);
    expect(r.modifiersApplied).toContain("weekend");
  });

  it("full-day cap applies to the summed split base: 315 capped at 300", () => {
    const withCap = [
      ...rates,
      { rateAmount: dec(300), band: 2, rateSubCategory: { code: "FULL_DAY" }, sla: { code: SLA } },
    ];
    const r = calculateDispatchVisit(
      v({ hoursOnSite: dec(4), inTime: "15:00", outTime: "19:00", businessWindow: WINDOW }),
      withCap,
    );
    expect(r.charge).toBe(300);
    expect(r.modifiersApplied).toContain("full-day cap");
  });

  it("generalizes freeHoursIncluded > 1: free 2h, 15:00–19:00 4h = 90 + 0×65 + 2×80 = 250", () => {
    const profile = { ...STANDARD_PROFILE, freeHoursIncluded: 2 };
    const r = calculateDispatchVisit(
      v({ hoursOnSite: dec(4), inTime: "15:00", outTime: "19:00", businessWindow: WINDOW }),
      rates,
      profile,
    );
    expect(r.charge).toBe(250);
  });

  it("no split without a window: window null + times = legacy single scenario (220)", () => {
    const r = calculateDispatchVisit(
      v({ hoursOnSite: dec(3), inTime: "15:00", outTime: "18:00", businessWindow: null }),
      rates,
    );
    expect(r.charge).toBe(220); // whole visit billed business (afterHours flag false)
  });

  it("no split without times: window set but no In/Out = legacy single scenario (220)", () => {
    const r = calculateDispatchVisit(
      v({ hoursOnSite: dec(3), businessWindow: WINDOW }),
      rates,
    );
    expect(r.charge).toBe(220);
  });
});

describe("dispatch manual OOO-hours fallback (no In/Out times)", () => {
  it("splits total into business + OOO: 4h with 2 OOO = 90 + 1×65 + 2×80 = 315", () => {
    const r = calculateDispatchVisit(v({ hoursOnSite: dec(4), oooHrs: 2 }), rates);
    expect(r.charge).toBe(315);
    expect(r.modifiersApplied).toContain("split business/after-hours");
  });

  it("all hours OOO uses the OOB first-hour rate: 3h all OOO = 120 + 2×80 = 280", () => {
    const r = calculateDispatchVisit(v({ hoursOnSite: dec(3), oooHrs: 3 }), rates);
    expect(r.charge).toBe(280);
    expect(r.modifiersApplied).toContain("out-of-business");
  });

  it("oooHrs > total clamps to total (all OOO): 2h with 5 OOO = 120 + 1×80 = 200", () => {
    expect(calculateDispatchVisit(v({ hoursOnSite: dec(2), oooHrs: 5 }), rates).charge).toBe(200);
  });

  it("weekend date ignores oooHrs and bills the whole visit weekend: 3h = 150 + 2×100 = 350", () => {
    const r = calculateDispatchVisit(v({ hoursOnSite: dec(3), oooHrs: 2, weekend: true }), rates);
    expect(r.charge).toBe(350);
  });

  it("oooHrs = 0 falls back to the legacy single business scenario: 3h = 220", () => {
    expect(calculateDispatchVisit(v({ hoursOnSite: dec(3), oooHrs: 0 }), rates).charge).toBe(220);
  });

  it("In/Out clock split takes precedence over oooHrs when both present", () => {
    // 15:00–19:00 weekday with a window → clock split (315), oooHrs ignored.
    const r = calculateDispatchVisit(
      v({ hoursOnSite: dec(4), inTime: "15:00", outTime: "19:00", businessWindow: WINDOW, oooHrs: 1 }),
      rates,
    );
    expect(r.charge).toBe(315);
  });
});
