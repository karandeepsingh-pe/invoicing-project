import { describe, expect, it } from "vitest";
import { resolvePolicy } from "../../src/lib/domain/policy-resolver";

const dayRateOrg = { backfillAllowed: true, rateBasis: "DAY_RATE" as const };

describe("resolvePolicy", () => {
  it("inherits org values when both overrides are null", () => {
    expect(
      resolvePolicy(dayRateOrg, {
        backfillAllowedOverride: null,
        rateBasisOverride: null,
      }),
    ).toEqual({ backfillAllowed: true, rateBasis: "DAY_RATE" });
  });

  it("account override wins over the org value", () => {
    expect(
      resolvePolicy(dayRateOrg, {
        backfillAllowedOverride: false,
        rateBasisOverride: "ANNUAL",
      }),
    ).toEqual({ backfillAllowed: false, rateBasis: "ANNUAL" });
  });

  it("honors an explicit false override instead of falling back to org true", () => {
    const r = resolvePolicy(
      { backfillAllowed: true, rateBasis: "ANNUAL" },
      { backfillAllowedOverride: false, rateBasisOverride: null },
    );
    expect(r.backfillAllowed).toBe(false);
    expect(r.rateBasis).toBe("ANNUAL"); // rateBasis still inherited
  });

  it("resolves each field independently", () => {
    const r = resolvePolicy(
      { backfillAllowed: false, rateBasis: "DAY_RATE" },
      { backfillAllowedOverride: true, rateBasisOverride: null },
    );
    expect(r).toEqual({ backfillAllowed: true, rateBasis: "DAY_RATE" });
  });
});
