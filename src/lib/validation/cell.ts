// Shared cell-text parser for the Dedicated FTE timesheet grid.
// Used by the client grid for invalid-cell highlighting and by the server
// save action for defense in depth. Single source of truth for what counts
// as a valid timesheet cell value.

export const STATUS_CODES = ["PH", "AB", "NA", "PTO", "HALF_DAY"] as const;
export type StatusCode = (typeof STATUS_CODES)[number];

const STATUS_SET = new Set<string>(STATUS_CODES);

// Statuses that bill as a FULL PAID day for a Dedicated (salaried) technician:
// the client pays for the allocated resource regardless of attendance.
//   PH  — public holiday
//   PTO — paid time off
// AB (absent) and NA (terminated / not active) credit zero; HALF_DAY credits 0.5.
//
// Single source of truth for the status -> day-credit rule, shared by the
// invoice engine (hours-split.ts) and the timesheet grid summary so the two
// cannot drift. Dependency-free (no Decimal) so both client and server import it.
export const PAID_LEAVE_STATUSES: readonly StatusCode[] = ["PH", "PTO"] as const;

const PAID_LEAVE_SET = new Set<StatusCode>(PAID_LEAVE_STATUSES);

/** Paid days credited for a status cell: 1 for PH/PTO, 0.5 for HALF_DAY, 0 for AB/NA. */
export function statusDayCredit(status: StatusCode): number {
  if (PAID_LEAVE_SET.has(status)) return 1;
  if (status === "HALF_DAY") return 0.5;
  return 0; // AB, NA
}

/** Paid (regular) hours credited for a status cell = day credit × the account's defaultHours. */
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
