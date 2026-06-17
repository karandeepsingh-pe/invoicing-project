import { describe, expect, it } from "vitest";
import {
  clientAccountCreateSchema,
  clientAccountUpdateSchema,
} from "@/lib/schemas/client-account";
import { bulkAccountRowSchema } from "@/lib/schemas/bulk-account-upload";

const baseCreate = { orgId: "o1", name: "Acme" };

describe("client account SDM owner (create)", () => {
  it("requires sdmName and sdmEmail", () => {
    const r = clientAccountCreateSchema.safeParse(baseCreate);
    expect(r.success).toBe(false);
  });

  it("rejects a non-Ovation SDM email", () => {
    const r = clientAccountCreateSchema.safeParse({
      ...baseCreate,
      sdmName: "Jane",
      sdmEmail: "jane@gmail.com",
    });
    expect(r.success).toBe(false);
  });

  it("accepts an @ovationwps.com SDM email and lowercases it", () => {
    const r = clientAccountCreateSchema.safeParse({
      ...baseCreate,
      sdmName: "Jane",
      sdmEmail: "Jane.Doe@OvationWPS.com",
      sdmPhone: "",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.sdmEmail).toBe("jane.doe@ovationwps.com");
      expect(r.data.sdmName).toBe("Jane");
    }
  });
});

describe("client account SDM owner (update)", () => {
  const baseUpdate = { id: "a1", name: "Acme" };

  it("allows a blank SDM (no-op, keeps existing owner)", () => {
    const r = clientAccountUpdateSchema.safeParse({ ...baseUpdate, sdmName: "", sdmEmail: "" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.sdmName).toBeUndefined();
      expect(r.data.sdmEmail).toBeUndefined();
    }
  });

  it("still validates the domain when an SDM email is provided", () => {
    const r = clientAccountUpdateSchema.safeParse({ ...baseUpdate, sdmEmail: "x@gmail.com" });
    expect(r.success).toBe(false);
  });
});

describe("bulk account upload SDM column", () => {
  const baseRow = { orgName: "Acme Corp", accountName: "Acme - Dedicated" };

  it("accepts a blank SDM (admin-only account by design)", () => {
    const r = bulkAccountRowSchema.safeParse({ ...baseRow, sdmEmail: "", sdmName: "" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.sdmEmail).toBeNull();
  });

  it("rejects a non-Ovation SDM email when present", () => {
    const r = bulkAccountRowSchema.safeParse({ ...baseRow, sdmEmail: "x@gmail.com" });
    expect(r.success).toBe(false);
  });

  it("accepts and lowercases an Ovation SDM email", () => {
    const r = bulkAccountRowSchema.safeParse({ ...baseRow, sdmEmail: "A@OvationWPS.com" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.sdmEmail).toBe("a@ovationwps.com");
  });
});
