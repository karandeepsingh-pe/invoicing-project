import { describe, expect, it } from "vitest";
import { isBillableStatus } from "../../src/lib/invoice/dispatch-status";

describe("isBillableStatus", () => {
  it("bills only COMPLETED visits", () => {
    expect(isBillableStatus("COMPLETED")).toBe(true);
  });

  it("does not bill cancelled / no-show / rescheduled / pending", () => {
    for (const s of ["CANCELLED", "NO_SHOW", "RESCHEDULED", "PENDING"]) {
      expect(isBillableStatus(s)).toBe(false);
    }
  });
});
