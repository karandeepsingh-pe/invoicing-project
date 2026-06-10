// Shared cell-text parser for the Dedicated FTE timesheet grid.
// Used by the client grid for invalid-cell highlighting and by the server
// save action for defense in depth. Single source of truth for what counts
// as a valid timesheet cell value.

export const STATUS_CODES = ["PH", "AB", "NA", "PTO", "HALF_DAY"] as const;
export type StatusCode = (typeof STATUS_CODES)[number];

const STATUS_SET = new Set<string>(STATUS_CODES);

// BILLABLE day credit for a status cell — what the CLIENT is charged.
//   PH  — public holiday  -> 1 (billed to the client as a full paid day)
//   PTO — paid time off    -> 0 (paid to the technician by Ovation, NOT billed)
//   AB  — absent           -> 0
//   NA  — terminated / N/A  -> 0
//   HALF_DAY               -> 0.5 (a worked half-day)
// PTO is an Ovation cost, not a client charge. PH bills as a paid day (the client
// pays for public holidays on a Dedicated allocation). User-confirmed 2026-06-10.
//
// Single source of truth for the status -> billable-day rule, shared by the
// invoice engine (hours-split.ts) and the timesheet grid summary so the two
// cannot drift. Dependency-free (no Decimal) so both client and server import it.

/** Billable days credited for a status cell: 1 for PH, 0.5 for HALF_DAY, 0 for PTO/AB/NA. */
export function statusDayCredit(status: StatusCode): number {
  if (status === "PH") return 1; // billed to the client
  if (status === "HALF_DAY") return 0.5;
  return 0; // PTO, AB, NA — not billed to the client
}

/** Billable (regular) hours credited for a status cell = day credit × the account's defaultHours. */
export function statusHourCredit(status: StatusCode, defaultHours: number): number {
  return statusDayCredit(status) * defaultHours;
}

// Allow whole or decimal hours, max two decimals, up to two digits before
// the dot. Range bound is enforced separately so we can give a precise
// error reason.
const NUMERIC_RE = /^\d{1,2}(\.\d{1,2})?$/;

export type CellParse =
  | { kind: "blank" }
  | { kind: "value"; hours: number }
  | { kind: "status"; status: StatusCode }
  | { kind: "invalid"; reason: string };

const INVALID_REASON = "Enter hours 0–24 or PH / AB / NA / PTO / HALF_DAY";

export function parseCellText(raw: string): CellParse {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { kind: "blank" };

  const upper = trimmed.toUpperCase();
  if (STATUS_SET.has(upper)) {
    return { kind: "status", status: upper as StatusCode };
  }

  if (!NUMERIC_RE.test(trimmed)) {
    return { kind: "invalid", reason: INVALID_REASON };
  }
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0 || n > 24) {
    return { kind: "invalid", reason: INVALID_REASON };
  }
  return { kind: "value", hours: n };
}

/**
 * Normalise a cell input for display:
 *   - Status codes get upper-cased.
 *   - Numeric values stay verbatim (no stripping of user-typed trailing zeros).
 * Invalid / blank pass through unchanged.
 */
export function normalizeCellText(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return "";
  const upper = trimmed.toUpperCase();
  if (STATUS_SET.has(upper)) return upper;
  return trimmed;
}
