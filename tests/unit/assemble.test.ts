import { describe, expect, it } from "vitest";
import { assembleInvoice } from "../../src/lib/invoice/assemble";

describe("assembleInvoice", () => {
  it("sums line items into subtotal; no fees means grand = subtotal", () => {
    const r = assembleInvoice([6175.0, 1976.19, 8200.0]);
    expect(r.subtotal).toBe(16351.19);
    expect(r.appliedFees).toEqual([]);
    expect(r.grandTotal).toBe(16351.19);
  });

  it("JLL: subtotal + 3% PM fee = grand total", () => {
    const r = assembleInvoice([10000], [{ kind: "percent", label: "PM", percent: 3 }]);
    expect(r.subtotal).toBe(10000);
    expect(r.appliedFees[0]).toMatchObject({ kind: "percent", percent: 3, amount: 300 });
    expect(r.grandTotal).toBe(10300);
  });

  it("percent is taken on subtotal, then flat fees added, in order", () => {
    const r = assembleInvoice(
      [10000],
      [
        { kind: "percent", label: "PM", percent: 3 },
        { kind: "flat", label: "Retainer", amount: 500 },
        { kind: "flat", label: "Reimbursements", amount: 123.45 },
      ],
    );
    expect(r.subtotal).toBe(10000);
    expect(r.appliedFees.map((f) => f.amount)).toEqual([300, 500, 123.45]);
    expect(r.grandTotal).toBe(10923.45);
  });

  it("rounds fee and total HALF_UP to cents", () => {
    // 1976.19 * 3% = 59.2857 -> 59.29; grand = 2035.48
    const r = assembleInvoice([1976.19], [{ kind: "percent", label: "PM", percent: 3 }]);
    expect(r.appliedFees[0].amount).toBe(59.29);
    expect(r.grandTotal).toBe(2035.48);
  });
});
