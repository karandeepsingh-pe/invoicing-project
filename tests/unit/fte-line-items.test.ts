import { describe, expect, it } from "vitest";
import { expandFteLineItems } from "@/lib/invoice/fte-line-items";
import type { PreInvoiceRow } from "@/lib/invoice/render-pre-invoice";

function fteRow(overrides: Partial<PreInvoiceRow> = {}): PreInvoiceRow {
  return {
    location: "Omaha, Nebraska",
    technicianName: "Nathan Scraper",
    bandLabel: "Band 2",
    backfillLabel: "No Backfill",
    engineerType: "FTE",
    businessDays: 20,
    daysWorked: 21,
    dayRate: 266.65,
    otHours: 0,
    otRate: 0,
    weekendHours: 0,
    weekendRate: 0,
    extendedTotal: 5599.65,
    ...overrides,
  };
}

function sum(rows: PreInvoiceRow[]): number {
  return Number(rows.reduce((n, r) => n + r.extendedTotal, 0).toFixed(2));
}

describe("expandFteLineItems", () => {
  it("passes rows without OT/weekend through unchanged (same reference)", () => {
    const row = fteRow();
    const out = expandFteLineItems([row]);
    expect(out).toHaveLength(1);
    expect(out[0]).toBe(row);
  });

  it("OT-only row splits into base + OT lines", () => {
    const row = fteRow({
      daysWorked: 21,
      otHours: 3,
      otRate: 75,
      extendedTotal: 266.65 * 21 + 3 * 75, // 5824.65
    });
    const out = expandFteLineItems([row]);
    expect(out).toHaveLength(2);

    const [base, ot] = out;
    expect(base.engineerType).toBe("FTE");
    expect(base.otHours).toBe(0);
    expect(base.weekendHours).toBe(0);
    expect(base.extendedTotal).toBeCloseTo(266.65 * 21, 2);

    expect(ot.engineerType).toBe("FTE — OT");
    expect(ot.technicianName).toBe(row.technicianName);
    expect(ot.daysWorked).toBe(0);
    expect(ot.dayRate).toBe(0);
    expect(ot.businessDays).toBe(0);
    expect(ot.otHours).toBe(3);
    expect(ot.otRate).toBe(75);
    expect(ot.extendedTotal).toBeCloseTo(225, 2);

    expect(sum(out)).toBeCloseTo(row.extendedTotal, 2);
  });

  it("OT + weekend row splits into three adjacent lines for the same tech", () => {
    const row = fteRow({
      otHours: 3,
      otRate: 75,
      weekendHours: 5.5,
      weekendRate: 100,
      extendedTotal: 266.65 * 21 + 225 + 550,
    });
    const out = expandFteLineItems([row]);
    expect(out.map((r) => r.engineerType)).toEqual(["FTE", "FTE — OT", "FTE — Weekend"]);
    expect(out.every((r) => r.technicianName === row.technicianName)).toBe(true);
    expect(out[2].weekendHours).toBe(5.5);
    expect(out[2].extendedTotal).toBeCloseTo(550, 2);
    expect(sum(out)).toBeCloseTo(row.extendedTotal, 2);
  });

  it("split lines sum exactly to the original on awkward rounding", () => {
    // 1.33h × 33.33 = 44.3289 -> 44.33; base derived by subtraction, so the
    // pieces always reassemble to the original cent.
    const row = fteRow({
      daysWorked: 10,
      dayRate: 123.4567,
      otHours: 1.33,
      otRate: 33.33,
      extendedTotal: Number((123.4567 * 10 + 1.33 * 33.33).toFixed(2)), // 1278.90
    });
    const out = expandFteLineItems([row]);
    expect(sum(out)).toBe(row.extendedTotal);
  });

  it("weekend-only row (no days, no remarks) drops the empty base line", () => {
    const row = fteRow({
      daysWorked: 0,
      dayRate: 0,
      weekendHours: 4,
      weekendRate: 90,
      extendedTotal: 360,
    });
    const out = expandFteLineItems([row]);
    expect(out).toHaveLength(1);
    expect(out[0].engineerType).toBe("FTE — Weekend");
    expect(out[0].extendedTotal).toBeCloseTo(360, 2);
  });

  it("backfill line keeps its remark on the base line; OT line carries none", () => {
    const row = fteRow({
      engineerType: "FTE (Backfill)",
      technicianName: "Cover Tech",
      daysWorked: 2,
      dayRate: 266.65,
      otHours: 1,
      otRate: 75,
      extendedTotal: Number((2 * 266.65 + 75).toFixed(2)),
      remarks: "Backfill for Shaful Bari — May 5, 8.00 hrs; May 6, 8.00 hrs",
    });
    const out = expandFteLineItems([row]);
    expect(out).toHaveLength(2);
    expect(out[0].remarks).toContain("Backfill for Shaful Bari");
    expect(out[1].engineerType).toBe("FTE (Backfill) — OT");
    expect(out[1].remarks).toBeUndefined();
    expect(sum(out)).toBeCloseTo(row.extendedTotal, 2);
  });

  it("multiple techs stay grouped in input order", () => {
    const a = fteRow({ technicianName: "A", otHours: 2, otRate: 50, extendedTotal: 5699.65 });
    const b = fteRow({ technicianName: "B" });
    const out = expandFteLineItems([a, b]);
    expect(out.map((r) => `${r.technicianName}:${r.engineerType}`)).toEqual([
      "A:FTE",
      "A:FTE — OT",
      "B:FTE",
    ]);
  });
});
