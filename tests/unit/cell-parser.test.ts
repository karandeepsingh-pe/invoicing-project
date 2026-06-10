import { describe, expect, it } from "vitest";
import {
  normalizeCellText,
  parseCellText,
  statusDayCredit,
  statusHourCredit,
} from "@/lib/validation/cell";

describe("parseCellText", () => {
  it("blank string -> blank", () => {
    expect(parseCellText("").kind).toBe("blank");
    expect(parseCellText("   ").kind).toBe("blank");
  });

  it("numeric -> value", () => {
    const r = parseCellText("8");
    expect(r.kind).toBe("value");
    if (r.kind === "value") expect(r.hours).toBe(8);
  });

  it("decimal numeric (2dp) -> value", () => {
    const r = parseCellText("8.5");
    expect(r.kind).toBe("value");
    if (r.kind === "value") expect(r.hours).toBe(8.5);
  });

  it("status code (uppercase) -> status", () => {
    const r = parseCellText("PH");
    expect(r.kind).toBe("status");
    if (r.kind === "status") expect(r.status).toBe("PH");
  });

  it("status code (lowercase) -> status normalised to upper", () => {
    const r = parseCellText("ph");
    expect(r.kind).toBe("status");
    if (r.kind === "status") expect(r.status).toBe("PH");
  });

  it("status code with whitespace -> status", () => {
    const r = parseCellText("  ab  ");
    expect(r.kind).toBe("status");
    if (r.kind === "status") expect(r.status).toBe("AB");
  });

  it("PTO -> status", () => {
    const r = parseCellText("pto");
    expect(r.kind).toBe("status");
    if (r.kind === "status") expect(r.status).toBe("PTO");
  });

  it("HALF_DAY -> status (case-insensitive)", () => {
    const r = parseCellText("half_day");
    expect(r.kind).toBe("status");
    if (r.kind === "status") expect(r.status).toBe("HALF_DAY");
  });

  it("apostrophe -> invalid", () => {
    const r = parseCellText("'");
    expect(r.kind).toBe("invalid");
  });

  it("negative -> invalid (no leading minus matches)", () => {
    const r = parseCellText("-1");
    expect(r.kind).toBe("invalid");
  });

  it("> 24 -> invalid", () => {
    const r = parseCellText("25");
    expect(r.kind).toBe("invalid");
  });

  it("double dot -> invalid", () => {
    const r = parseCellText("8..5");
    expect(r.kind).toBe("invalid");
  });

  it("more than 2 decimals -> invalid", () => {
    const r = parseCellText("8.555");
    expect(r.kind).toBe("invalid");
  });

  it("alpha string -> invalid", () => {
    const r = parseCellText("abc");
    expect(r.kind).toBe("invalid");
  });

  it("zero -> value(0)", () => {
    const r = parseCellText("0");
    expect(r.kind).toBe("value");
    if (r.kind === "value") expect(r.hours).toBe(0);
  });
});

describe("normalizeCellText", () => {
  it("uppercases status", () => {
    expect(normalizeCellText("ph")).toBe("PH");
    expect(normalizeCellText("  Na ")).toBe("NA");
  });

  it("trims numeric without altering content", () => {
    expect(normalizeCellText(" 8.5 ")).toBe("8.5");
  });

  it("invalid input passes through trimmed (UI keeps user's text visible)", () => {
    expect(normalizeCellText("'")).toBe("'");
  });

  it("blank stays blank", () => {
    expect(normalizeCellText("   ")).toBe("");
  });
});

describe("statusDayCredit", () => {
  it("PH bills as a full paid day; PTO is not billed to the client", () => {
    expect(statusDayCredit("PH")).toBe(1);
    expect(statusDayCredit("PTO")).toBe(0);
  });

  it("HALF_DAY credits half a day", () => {
    expect(statusDayCredit("HALF_DAY")).toBe(0.5);
  });

  it("AB and NA credit zero", () => {
    expect(statusDayCredit("AB")).toBe(0);
    expect(statusDayCredit("NA")).toBe(0);
  });
});

describe("statusHourCredit", () => {
  it("= day credit × defaultHours", () => {
    expect(statusHourCredit("PH", 8)).toBe(8);
    expect(statusHourCredit("PTO", 8)).toBe(0);
    expect(statusHourCredit("HALF_DAY", 8)).toBe(4);
    expect(statusHourCredit("AB", 8)).toBe(0);
    expect(statusHourCredit("NA", 7)).toBe(0);
  });
});
