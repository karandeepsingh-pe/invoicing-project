import { describe, expect, it } from "vitest";
import {
  postalCodeCreateSchema,
  postalCodeUpdateSchema,
} from "@/lib/schemas/postal-code";

describe("postalCodeCreateSchema", () => {
  it("accepts a well-formed row", () => {
    const result = postalCodeCreateSchema.safeParse({
      zipcode: "94016",
      city: "San Francisco",
      state: "CA",
      country: "USA",
      sortOrder: 0,
    });
    expect(result.success).toBe(true);
  });

  it("trims whitespace on text fields", () => {
    const result = postalCodeCreateSchema.parse({
      zipcode: "  94016  ",
      city: " San Francisco ",
      state: " CA ",
      country: " USA ",
      sortOrder: 1,
    });
    expect(result.zipcode).toBe("94016");
    expect(result.city).toBe("San Francisco");
    expect(result.state).toBe("CA");
    expect(result.country).toBe("USA");
    expect(result.sortOrder).toBe(1);
  });

  it("defaults sortOrder when missing", () => {
    const result = postalCodeCreateSchema.parse({
      zipcode: "10001",
      city: "New York",
      state: "NY",
      country: "USA",
    });
    expect(result.sortOrder).toBe(0);
  });

  it("rejects empty zipcode", () => {
    const result = postalCodeCreateSchema.safeParse({
      zipcode: "",
      city: "NYC",
      state: "NY",
      country: "USA",
    });
    expect(result.success).toBe(false);
  });

  it("rejects oversized zipcode", () => {
    const result = postalCodeCreateSchema.safeParse({
      zipcode: "1234567890123",
      city: "NYC",
      state: "NY",
      country: "USA",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing city", () => {
    const result = postalCodeCreateSchema.safeParse({
      zipcode: "10001",
      city: "",
      state: "NY",
      country: "USA",
    });
    expect(result.success).toBe(false);
  });
});

describe("postalCodeUpdateSchema", () => {
  it("requires id", () => {
    const result = postalCodeUpdateSchema.safeParse({
      zipcode: "94016",
      city: "SF",
      state: "CA",
      country: "USA",
    });
    expect(result.success).toBe(false);
  });

  it("accepts id + valid fields", () => {
    const result = postalCodeUpdateSchema.safeParse({
      id: "cuid-abc",
      zipcode: "94016",
      city: "SF",
      state: "CA",
      country: "USA",
      sortOrder: 2,
    });
    expect(result.success).toBe(true);
  });
});
