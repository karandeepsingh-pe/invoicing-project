import { describe, expect, it } from "vitest";
import { deriveRebadgedRates } from "../../src/lib/invoice/rebadged-rates";

describe("deriveRebadgedRates", () => {
  it("zero / null / negative salary → zero rates", () => {
    expect(deriveRebadgedRates(0, 8)).toEqual({ hourly: 0, dayRate: 0 });
    expect(deriveRebadgedRates(null, 8)).toEqual({ hourly: 0, dayRate: 0 });
    expect(deriveRebadgedRates(undefined, 8)).toEqual({ hourly: 0, dayRate: 0 });
  });

  it("208000 / 2080 → hourly 100, day 800 at 8h", () => {
    expect(deriveRebadgedRates(208000, 8)).toEqual({ hourly: 100, dayRate: 800 });
  });

  it("scales the day rate by Default Hours", () => {
    const r = deriveRebadgedRates(104000, 8); // hourly 50
    expect(r.hourly).toBe(50);
    expect(r.dayRate).toBe(400);
    expect(deriveRebadgedRates(104000, 7.5).dayRate).toBe(375);
  });
});
