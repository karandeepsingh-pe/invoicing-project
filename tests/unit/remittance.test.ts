import { describe, expect, it } from "vitest";
import { clientBillingFor, OVATION_REMITTANCE } from "../../src/lib/constants/remittance";

const emptyAccount = {
  name: "Fiserv",
  addressLine1: null,
  city: null,
  state: null,
  postalCode: null,
  country: null,
};

describe("clientBillingFor", () => {
  it("prefers the org's own configured bill-to entity", () => {
    const r = clientBillingFor(
      {
        name: "HCL",
        remitClientCode: "A009",
        remitClientName: "HCL America Inc.",
        remitClientAddress: "2600 Great America Way\nSanta Clara, CA 95054, United States",
      },
      emptyAccount,
    );
    expect(r).toEqual({
      code: "A009",
      name: "HCL America Inc.",
      addressLines: ["2600 Great America Way", "Santa Clara, CA 95054, United States"],
    });
  });

  it("falls back to the built-in HCL default for HCL orgs with no override", () => {
    const r = clientBillingFor({ name: "HCL", outputTemplate: "PRE_INVOICE" } as never, emptyAccount);
    expect(r.code).toBe("A009");
    expect(r.name).toBe("HCL America Inc.");
    expect(r.addressLines.length).toBeGreaterThan(0);
  });

  it("falls back to the account address for other orgs", () => {
    const r = clientBillingFor(
      { name: "Cognizant" },
      {
        name: "Acme Co",
        addressLine1: "1 Main St",
        city: "Austin",
        state: "TX",
        postalCode: "78701",
        country: "USA",
      },
    );
    expect(r.name).toBe("Acme Co");
    expect(r.addressLines).toEqual(["1 Main St", "Austin, TX 78701", "USA"]);
  });

  it("treats a blank org name override as not configured", () => {
    const r = clientBillingFor(
      { name: "Cognizant", remitClientName: "   " },
      emptyAccount,
    );
    expect(r.name).toBe("Fiserv"); // account fallback, not the blank override
  });
});

describe("OVATION_REMITTANCE", () => {
  it("carries the hardcoded Ovation receiving-account block", () => {
    expect(OVATION_REMITTANCE.bankName).toBe("Wells Fargo Bank");
    expect(OVATION_REMITTANCE.routingNumber).toBe("121 000 248");
    expect(OVATION_REMITTANCE.accountNumber).toBe("413 596 2736");
    expect(OVATION_REMITTANCE.footerNote).toContain("accounts@ovationwps.com");
  });
});
