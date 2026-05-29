import { describe, expect, it } from "vitest";
import {
  businessDaysInRange,
  daysInRange,
  isWeekend,
  monthRange,
} from "@/lib/invoice/period";

describe("monthRange", () => {
  it("returns [start, exclusive end) for a normal month", () => {
    const { start, end } = monthRange(2026, 4);
    expect(start.toISOString()).toBe("2026-04-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-05-01T00:00:00.000Z");
  });

  it("rejects invalid month", () => {
    expect(() => monthRange(2026, 0)).toThrow();
    expect(() => monthRange(2026, 13)).toThrow();
  });
});

describe("daysInRange", () => {
  it("returns one Date per day inside the half-open range", () => {
    const days = daysInRange(monthRange(2026, 4));
    expect(days).toHaveLength(30);
    expect(days[0].getUTCDate()).toBe(1);
    expect(days[29].getUTCDate()).toBe(30);
  });
});

describe("isWeekend", () => {
  it("flags Saturday + Sunday", () => {
    expect(isWeekend(new Date(Date.UTC(2026, 3, 4)))).toBe(true); // Sat
    expect(isWeekend(new Date(Date.UTC(2026, 3, 5)))).toBe(true); // Sun
    expect(isWeekend(new Date(Date.UTC(2026, 3, 6)))).toBe(false); // Mon
  });
});

describe("businessDaysInRange", () => {
  it("counts April 2026 weekdays without holidays", () => {
    expect(businessDaysInRange(monthRange(2026, 4), [])).toBe(22);
  });

  it("subtracts a weekday PH", () => {
    const phApr3 = new Date(Date.UTC(2026, 3, 3)); // Friday
    expect(businessDaysInRange(monthRange(2026, 4), [phApr3])).toBe(21);
  });

  it("ignores PH dates that fall on weekends", () => {
    const phApr4 = new Date(Date.UTC(2026, 3, 4)); // Saturday
    expect(businessDaysInRange(monthRange(2026, 4), [phApr4])).toBe(22);
  });

  it("ignores PH dates outside the range", () => {
    const phMar = new Date(Date.UTC(2026, 2, 27)); // Friday March
    expect(businessDaysInRange(monthRange(2026, 4), [phMar])).toBe(22);
  });
});
