// Normalizers for raw ExcelJS cell values used by the bulk-upload parsers.
// ExcelJS cells can hold strings, numbers, Dates, booleans, formulas, rich
// text, or hyperlink objects — each helper collapses them to the string shape
// the row schemas expect. Pure module (no server deps) so tests cover it.

export function cellToString(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.richText)) {
      return (o.richText as { text?: string }[]).map((t) => t.text ?? "").join("").trim();
    }
    if (typeof o.text === "string") return o.text.trim();
    if ("result" in o) return cellToString(o.result);
    if (typeof o.hyperlink === "string") return o.hyperlink.trim();
  }
  return "";
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Normalize a cell that should hold a wall-clock time to "HH:mm".
 * Accepts: Excel time cells (Date on the 1899 epoch — read via UTC parts),
 * Excel day-fraction numbers (0.5 -> "12:00"), and strings ("9:5" -> "09:05").
 * Returns "" for blank and the trimmed input for anything unparseable
 * (the Zod schema then reports the precise format error).
 */
export function cellToTimeString(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) {
    return `${pad2(v.getUTCHours())}:${pad2(v.getUTCMinutes())}`;
  }
  if (typeof v === "number") {
    if (v < 0 || v >= 1) return String(v);
    const totalMinutes = Math.round(v * 24 * 60);
    return `${pad2(Math.floor(totalMinutes / 60))}:${pad2(totalMinutes % 60)}`;
  }
  const s = cellToString(v);
  if (s === "") return "";
  const m = /^(\d{1,2}):(\d{1,2})(?::\d{1,2})?$/.exec(s);
  if (!m) return s;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh > 23 || mm > 59) return s;
  return `${pad2(hh)}:${pad2(mm)}`;
}

/**
 * Normalize a cell that should hold a calendar date to "YYYY-MM-DD".
 * Excel date cells arrive as Date objects (UTC); strings must already be
 * ISO "YYYY-MM-DD" (the template says so) — anything else passes through
 * for the schema to reject with a clear message.
 */
export function cellToDateString(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return cellToString(v);
}

/**
 * Lenient yes/no parser for template flag columns.
 * "" -> defaultValue; y/yes/true/1 -> true; n/no/false/0 -> false; else null
 * (callers surface a row error).
 */
export function parseYesNo(raw: string, defaultValue: boolean): boolean | null {
  const s = raw.trim().toLowerCase();
  if (s === "") return defaultValue;
  if (["y", "yes", "true", "1"].includes(s)) return true;
  if (["n", "no", "false", "0"].includes(s)) return false;
  return null;
}
