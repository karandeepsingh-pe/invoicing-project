import { describe, expect, it } from "vitest";
import { filterByText, matchesQuery } from "@/lib/display/option-filter";

describe("matchesQuery", () => {
  it("matches everything on blank or whitespace query", () => {
    expect(matchesQuery("John Smith", "")).toBe(true);
    expect(matchesQuery("John Smith", "   ")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(matchesQuery("John SMITH", "smith")).toBe(true);
    expect(matchesQuery("john smith", "SMITH")).toBe(true);
  });

  it("matches mid-word substrings", () => {
    expect(matchesQuery("John Smith", "ohn")).toBe(true);
  });

  it("requires every token to match (AND semantics)", () => {
    expect(matchesQuery("John Smith", "jo sm")).toBe(true);
    expect(matchesQuery("John Smith", "jo xx")).toBe(false);
  });

  it("is token-order independent", () => {
    expect(matchesQuery("John Smith", "smith jo")).toBe(true);
  });

  it("matches concatenated label + sublabel haystacks", () => {
    expect(matchesQuery("Ana Lopez · Band 2 busy 09:00–11:00", "busy")).toBe(true);
  });
});

describe("filterByText", () => {
  const items = [
    { id: "1", name: "John Smith" },
    { id: "2", name: "Ana Lopez" },
    { id: "3", name: "Joana Smithers" },
  ];

  it("returns the same array reference for a blank query", () => {
    expect(filterByText(items, "", (i) => i.name)).toBe(items);
    expect(filterByText(items, "  ", (i) => i.name)).toBe(items);
  });

  it("filters by case-insensitive substring", () => {
    expect(filterByText(items, "smith", (i) => i.name).map((i) => i.id)).toEqual(["1", "3"]);
  });

  it("applies multi-token AND across the extracted text", () => {
    expect(filterByText(items, "jo smith", (i) => i.name).map((i) => i.id)).toEqual(["1", "3"]);
    expect(filterByText(items, "lopez smith", (i) => i.name)).toEqual([]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(filterByText(items, "zzz", (i) => i.name)).toEqual([]);
  });

  it("does not mutate the input", () => {
    const before = [...items];
    filterByText(items, "smith", (i) => i.name);
    expect(items).toEqual(before);
  });
});
