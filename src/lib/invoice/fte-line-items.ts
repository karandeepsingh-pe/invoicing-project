// Splits a Dedicated FTE pre-invoice row into separate line items: the base
// days line plus one "— OT" and/or one "— Weekend" line per technician, so
// overtime and weekend work never hide inside a single row. Pre-Invoice /
// combined output only — the FSO (HCL) format keeps OT/weekend as columns to
// stay template-identical.

import type { PreInvoiceRow } from "./render-pre-invoice";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Expand each FTE row carrying OT and/or weekend hours into adjacent line
 * items (base, OT, weekend) for the same technician. The base line's Extended
 * is derived by subtraction so the split lines always sum exactly to the
 * original row's Extended Total — subtotals and misc-fee percentages are
 * unchanged. Rows without OT/weekend pass through untouched.
 */
export function expandFteLineItems(rows: PreInvoiceRow[]): PreInvoiceRow[] {
  const out: PreInvoiceRow[] = [];
  for (const row of rows) {
    if (row.otHours === 0 && row.weekendHours === 0) {
      out.push(row);
      continue;
    }

    const otCost = round2(row.otHours * row.otRate);
    const weekendCost = round2(row.weekendHours * row.weekendRate);
    const baseExtended = round2(row.extendedTotal - otCost - weekendCost);

    // A tech with only OT/weekend work (no regular days) gets no empty base line.
    const keepBase = row.daysWorked !== 0 || baseExtended !== 0 || Boolean(row.remarks);
    if (keepBase) {
      out.push({
        ...row,
        otHours: 0,
        otRate: 0,
        weekendHours: 0,
        weekendRate: 0,
        extendedTotal: baseExtended,
      });
    }

    if (row.otHours > 0) {
      out.push({
        ...row,
        engineerType: `${row.engineerType} — OT`,
        businessDays: 0,
        daysWorked: 0,
        dayRate: 0,
        weekendHours: 0,
        weekendRate: 0,
        extendedTotal: otCost,
        remarks: undefined,
      });
    }

    if (row.weekendHours > 0) {
      out.push({
        ...row,
        engineerType: `${row.engineerType} — Weekend`,
        businessDays: 0,
        daysWorked: 0,
        dayRate: 0,
        otHours: 0,
        otRate: 0,
        extendedTotal: weekendCost,
        remarks: undefined,
      });
    }
  }
  return out;
}
