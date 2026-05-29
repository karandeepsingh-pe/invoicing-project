import { describe, expect, it } from "vitest";
import { deriveAnnualDayRate } from "../../src/lib/invoice/billing-basis";

// Extended (FTE) = (Annual / 12) x (DaysWorked / BusinessDays)
//               = dayRate x daysWorked, where dayRate = annual / (12 x businessDays).
// Rounded to cents the way the row loader does today (.toFixed(2)).
function fteExtended(annual: number, businessDays: number, daysWorked: number): number {
  return Number((deriveAnnualDayRate(annual, businessDays) * daysWorked).toFixed(2));
}

describe("deriveAnnualDayRate", () => {
  it("annual / (12 x businessDays)", () => {
    expect(deriveAnnualDayRate(74100, 21)).toBeCloseTo(74100 / (12 * 21), 8);
  });

  it("zero / null / undefined / nonpositive businessDays -> 0", () => {
    expect(deriveAnnualDayRate(0, 21)).toBe(0);
    expect(deriveAnnualDayRate(null, 21)).toBe(0);
    expect(deriveAnnualDayRate(undefined, 21)).toBe(0);
    expect(deriveAnnualDayRate(60000, 0)).toBe(0);
    expect(deriveAnnualDayRate(-100, 21)).toBe(0);
  });
});

describe("FTE extended total (known-good invoices)", () => {
  it("annual 74100 with-backfill, 21/21 worked -> 6175.00", () => {
    expect(fteExtended(74100, 21, 21)).toBe(6175.0);
  });

  it("annual 83000 no-backfill, 6/21 worked -> 1976.19", () => {
    expect(fteExtended(83000, 21, 6)).toBe(1976.19);
  });

  it("full month at full attendance equals annual / 12", () => {
    expect(fteExtended(74100, 21, 21)).toBe(Number((74100 / 12).toFixed(2)));
  });
});
