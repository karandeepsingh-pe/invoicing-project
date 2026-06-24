import { describe, expect, it } from "vitest";
import { orgSupportsFso, isHclOrg } from "../../src/lib/invoice/fso-eligibility";

describe("isHclOrg", () => {
  it("matches HCL in any case, trimmed, and with a suffix word", () => {
    expect(isHclOrg("HCL")).toBe(true);
    expect(isHclOrg("hcl")).toBe(true);
    expect(isHclOrg("  HCL  ")).toBe(true);
    expect(isHclOrg("HCL America Inc.")).toBe(true);
  });

  it("does not match other orgs or substrings", () => {
    expect(isHclOrg("Cognizant")).toBe(false);
    expect(isHclOrg("TCS")).toBe(false);
    expect(isHclOrg("Wipro")).toBe(false);
    expect(isHclOrg("BHCL")).toBe(false); // must start with HCL
  });
});

describe("orgSupportsFso", () => {
  it("is true for any HCL org regardless of stored template", () => {
    expect(orgSupportsFso({ name: "HCL", outputTemplate: "PRE_INVOICE" })).toBe(true);
    expect(orgSupportsFso({ name: "hcl", outputTemplate: "PRE_INVOICE" })).toBe(true);
  });

  it("honours an explicit FSO template flag on a non-HCL org", () => {
    expect(orgSupportsFso({ name: "SomeOrg", outputTemplate: "FSO" })).toBe(true);
  });

  it("is false for non-HCL PRE_INVOICE orgs", () => {
    expect(orgSupportsFso({ name: "Cognizant", outputTemplate: "PRE_INVOICE" })).toBe(false);
    expect(orgSupportsFso({ name: "TCS", outputTemplate: "PRE_INVOICE" })).toBe(false);
  });
});
