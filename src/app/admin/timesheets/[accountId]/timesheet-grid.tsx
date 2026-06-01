"use client";

import { useMemo, useState, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { saveTimesheetMonth } from "@/lib/actions/timesheet";
import {
  softDeleteTimesheetCell,
  softDeleteTimesheetRowMonth,
  softDeleteTimesheetRowsMonth,
} from "@/lib/actions/soft-delete";
import { useActionToast } from "@/lib/hooks/use-action-toast";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import {
  normalizeCellText,
  parseCellText,
  type CellParse,
} from "@/lib/validation/cell";
import { daysInFillRange } from "@/lib/domain/timesheet-month";
import { FillRangeDialog } from "./fill-range-dialog";

export type GridCell = {
  hours: number | null;
  status: "PH" | "AB" | "NA" | "PTO" | "HALF_DAY" | null;
};

export type GridAssignment = {
  assignmentId: string;
  technicianName: string;
  category: "DEDICATED" | "PROJECT_TM" | "SCHEDULED";
  contactNo?: string;
  location: string;
  band: number;
  slaTier: "BACKFILL" | "NO_BACKFILL" | "NONE";
};

function slaTierLabel(t: GridAssignment["slaTier"]): string {
  if (t === "BACKFILL") return "Backfill";
  if (t === "NO_BACKFILL") return "No Backfill";
  return "—";
}

function categoryLabel(c: GridAssignment["category"]): string {
  if (c === "PROJECT_TM") return "Project";
  if (c === "SCHEDULED") return "Scheduled";
  return "Dedicated";
}

type RawCells = Record<string, GridCell>;
type RawText = Record<string, string>;

function cellKey(assignmentId: string, date: string): string {
  return `${assignmentId}|${date}`;
}

function cellToText(cell: GridCell | undefined): string {
  if (!cell) return "";
  if (cell.status) return cell.status;
  if (cell.hours === null) return "";
  return Number.isInteger(cell.hours)
    ? String(cell.hours)
    : cell.hours.toFixed(2).replace(/\.?0+$/, "");
}

function dayOfWeekUtc(date: string): number {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay();
}

function isWeekend(date: string): boolean {
  const d = dayOfWeekUtc(date);
  return d === 0 || d === 6;
}

export function TimesheetGrid({
  accountId,
  year,
  month,
  defaultHours,
  assignments,
  days,
  initialCells,
  softDeleteEnabled = false,
  holidayDates = [],
  prefillHolidaysAsPh = false,
}: {
  accountId: string;
  year: number;
  month: number;
  defaultHours: number;
  assignments: GridAssignment[];
  days: string[];
  initialCells: RawCells;
  softDeleteEnabled?: boolean;
  holidayDates?: string[];
  prefillHolidaysAsPh?: boolean;
}) {
  const [text, setText] = useState<RawText>(() => {
    // Dedicated grids pre-fill PH on gazetted-holiday weekdays (overridable);
    // a PH day bills as a paid day. Other un-entered weekdays default to hours.
    const holidaySet = new Set(prefillHolidaysAsPh ? holidayDates : []);
    const out: RawText = {};
    for (const a of assignments) {
      for (const d of days) {
        const key = cellKey(a.assignmentId, d);
        const saved = initialCells[key];
        if (saved !== undefined) {
          out[key] = cellToText(saved);
        } else if (isWeekend(d)) {
          out[key] = "";
        } else if (holidaySet.has(d)) {
          out[key] = "PH";
        } else {
          out[key] = String(defaultHours);
        }
      }
    }
    return out;
  });
  const [actionState, setActionState] = useState<
    | { ok: true; message?: string }
    | { ok: false; formError?: string }
    | null
  >(null);
  const [pending, startTransition] = useTransition();

  useActionToast(actionState, {
    success: { title: "Timesheet saved" },
    error: { fallbackTitle: "Failed to save timesheet" },
  });

  const router = useRouter();
  const [deleteState, setDeleteState] = useState<
    { ok: true; message?: string } | { ok: false; formError?: string } | null
  >(null);
  const [deletePending, startDeleteTransition] = useTransition();
  const [selectedAssignmentIds, setSelectedAssignmentIds] = useState<Set<string>>(
    () => new Set(),
  );
  // Cells the user typed into this session. Combined with savedKeys (the server's
  // saved entries), this lets the grid dim cells that are only the default
  // pre-fill — so a deleted/cleared row reads as empty instead of re-showing the
  // default hours.
  const [editedKeys, setEditedKeys] = useState<Set<string>>(() => new Set());
  const savedKeys = useMemo(() => new Set(Object.keys(initialCells)), [initialCells]);

  useActionToast(deleteState, {
    success: { title: "Deleted" },
    error: { fallbackTitle: "Delete failed" },
  });

  function toggleRow(assignmentId: string) {
    setSelectedAssignmentIds((prev) => {
      const next = new Set(prev);
      if (next.has(assignmentId)) next.delete(assignmentId);
      else next.add(assignmentId);
      return next;
    });
  }

  // After a successful soft-delete, optimistically revert the affected cells to
  // their un-entered look (weekday -> default hours, weekend -> blank) and pull
  // fresh server data. On failure, leave the grid untouched.
  function applyDeleteResult(
    result: { ok: true; message?: string } | { ok: false; formError?: string },
    affectedKeys: string[],
  ) {
    setDeleteState(result);
    if (!result.ok) return;
    setText((prev) => {
      const next = { ...prev };
      for (const key of affectedKeys) {
        const date = key.slice(key.indexOf("|") + 1);
        next[key] = isWeekend(date) ? "" : String(defaultHours);
      }
      return next;
    });
    // Cleared cells are no longer user-entered; drop them so they render dimmed
    // (and savedKeys loses them once the refresh lands).
    setEditedKeys((prev) => {
      if (!affectedKeys.some((k) => prev.has(k))) return prev;
      const next = new Set(prev);
      for (const k of affectedKeys) next.delete(k);
      return next;
    });
    router.refresh();
  }

  function handleDeleteCell(assignmentId: string, date: string) {
    startDeleteTransition(async () => {
      const fd = new FormData();
      fd.append("assignmentId", assignmentId);
      fd.append("date", date);
      const result = await softDeleteTimesheetCell(null, fd);
      if (result) applyDeleteResult(result, [cellKey(assignmentId, date)]);
    });
  }

  function handleDeleteRow(assignmentId: string) {
    startDeleteTransition(async () => {
      const fd = new FormData();
      fd.append("assignmentId", assignmentId);
      fd.append("year", String(year));
      fd.append("month", String(month));
      const result = await softDeleteTimesheetRowMonth(null, fd);
      if (result) {
        applyDeleteResult(
          result,
          days.map((d) => cellKey(assignmentId, d)),
        );
      }
    });
  }

  // Bulk soft-delete the month for every selected technician row at once.
  function handleDeleteRows(): Promise<void> {
    return new Promise<void>((resolve) => {
      startDeleteTransition(async () => {
        const ids = Array.from(selectedAssignmentIds);
        const fd = new FormData();
        for (const id of ids) fd.append("assignmentIds", id);
        fd.append("year", String(year));
        fd.append("month", String(month));
        const result = await softDeleteTimesheetRowsMonth(null, fd);
        if (result) {
          applyDeleteResult(
            result,
            ids.flatMap((id) => days.map((d) => cellKey(id, d))),
          );
          if (result.ok) setSelectedAssignmentIds(new Set());
        }
        resolve();
      });
    });
  }

  // Pre-parse every cell once per state change. The grid uses this for live
  // summaries, per-cell red-borders, and the save-button disabled check.
  const parsedByKey = useMemo(() => {
    const out: Record<string, CellParse> = {};
    for (const a of assignments) {
      for (const d of days) {
        const key = cellKey(a.assignmentId, d);
        out[key] = parseCellText(text[key] ?? "");
      }
    }
    return out;
  }, [assignments, days, text]);

  const invalidCellCount = useMemo(() => {
    let n = 0;
    for (const k of Object.keys(parsedByKey)) {
      if (parsedByKey[k].kind === "invalid") n += 1;
    }
    return n;
  }, [parsedByKey]);

  // Blank weekday cells are blocking: a working day must carry hours or a
  // status (PH / AB / NA). An empty cell means "unknown" and must never be
  // silently auto-filled into the invoice. Weekend blanks are fine (no row).
  const blankWeekdayKeys = useMemo(() => {
    const out = new Set<string>();
    for (const a of assignments) {
      for (const d of days) {
        if (isWeekend(d)) continue;
        const key = cellKey(a.assignmentId, d);
        if (parsedByKey[key].kind === "blank") out.add(key);
      }
    }
    return out;
  }, [assignments, days, parsedByKey]);

  const blankWeekdayCount = blankWeekdayKeys.size;

  const summaries = useMemo(() => {
    return assignments.map((a) => {
      let regularDays = 0;
      let otHours = 0;
      let weekendHours = 0;
      for (const d of days) {
        const p = parsedByKey[cellKey(a.assignmentId, d)];
        if (p.kind === "status" && p.status === "HALF_DAY") {
          regularDays += 0.5;
          continue;
        }
        if (p.kind !== "value") continue;
        const h = p.hours;
        if (h <= 0) continue;
        if (isWeekend(d)) {
          weekendHours += h;
        } else {
          const reg = Math.min(h, defaultHours);
          const ot = Math.max(0, h - defaultHours);
          regularDays += reg / defaultHours;
          otHours += ot;
        }
      }
      return {
        assignmentId: a.assignmentId,
        regularDays,
        otHours,
        weekendHours,
      };
    });
  }, [assignments, days, defaultHours, parsedByKey]);

  function handleChange(
    assignmentId: string,
    date: string,
    e: ChangeEvent<HTMLInputElement>,
  ) {
    const key = cellKey(assignmentId, date);
    setText((prev) => ({ ...prev, [key]: e.target.value }));
    setEditedKeys((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
  }

  // Per-row "Fill range": write one value/status into every day in a range. Pure
  // client edit into the same text state typing uses; Save month persists it.
  function handleFillRange(
    assignmentId: string,
    args: { value: string; fromDate: string; toDate: string; weekdaysOnly: boolean },
  ) {
    const targetDays = daysInFillRange(days, args.fromDate, args.toDate, args.weekdaysOnly);
    if (targetDays.length === 0) return;
    const norm = normalizeCellText(args.value);
    const keys = targetDays.map((d) => cellKey(assignmentId, d));
    setText((prev) => {
      const next = { ...prev };
      for (const k of keys) next[k] = norm;
      return next;
    });
    setEditedKeys((prev) => {
      const nextSet = new Set(prev);
      for (const k of keys) nextSet.add(k);
      return nextSet;
    });
  }

  function handleBlur(assignmentId: string, date: string) {
    setText((prev) => {
      const key = cellKey(assignmentId, date);
      const raw = prev[key] ?? "";
      const normalized = normalizeCellText(raw);
      if (normalized === raw) return prev;
      return { ...prev, [key]: normalized };
    });
  }

  function handleSave() {
    if (invalidCellCount > 0) {
      setActionState({
        ok: false,
        formError: `${invalidCellCount} cell${invalidCellCount === 1 ? "" : "s"} have invalid values — fix them before saving.`,
      });
      return;
    }

    if (blankWeekdayCount > 0) {
      setActionState({
        ok: false,
        formError: `${blankWeekdayCount} working-day cell${blankWeekdayCount === 1 ? " is" : "s are"} blank — enter hours or a status (PH / AB / NA / PTO / HALF_DAY) for every working day before saving.`,
      });
      return;
    }

    // Build payload. Every working day now carries an explicit value or status
    // (blank weekdays are blocked above). Weekend blank cells stay blank.
    const cells: {
      assignmentId: string;
      date: string;
      hours: number | null;
      status: GridCell["status"];
    }[] = [];

    for (const a of assignments) {
      for (const d of days) {
        const key = cellKey(a.assignmentId, d);
        const p = parsedByKey[key];
        if (p.kind === "invalid") {
          // Should be unreachable thanks to the guard above; defensive.
          continue;
        }
        if (p.kind === "blank") {
          // Weekend blank = no row. Weekday blank is unreachable (guarded
          // above), but skip defensively rather than auto-fill.
          continue;
        }
        if (p.kind === "status") {
          cells.push({
            assignmentId: a.assignmentId,
            date: d,
            hours: 0,
            status: p.status,
          });
          continue;
        }
        // numeric value
        cells.push({
          assignmentId: a.assignmentId,
          date: d,
          hours: p.hours,
          status: null,
        });
      }
    }

    const payload = { accountId, year, month, cells };
    startTransition(async () => {
      const fd = new FormData();
      fd.append("payload", JSON.stringify(payload));
      const result = await saveTimesheetMonth(null, fd);
      setActionState(result);
    });
  }

  const saveDisabled = pending || invalidCellCount > 0 || blankWeekdayCount > 0;
  const saveHint =
    invalidCellCount > 0
      ? `${invalidCellCount} cell${invalidCellCount === 1 ? "" : "s"} have invalid values`
      : blankWeekdayCount > 0
        ? `${blankWeekdayCount} working-day cell${blankWeekdayCount === 1 ? " is" : "s are"} blank`
        : "Every working day has hours or a status";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-fg-subtle">
          Scroll right to see all days · {assignments.length} technician
          {assignments.length === 1 ? "" : "s"} · {days.length} days · dimmed cells are
          unsaved defaults
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saveDisabled}
          title={saveHint}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save month"}
        </button>
      </div>

      {softDeleteEnabled && (
        <div className="flex items-center justify-between rounded-md border border-border-strong bg-surface px-3 py-2 text-xs">
          <span className="font-medium text-fg">
            {selectedAssignmentIds.size} row{selectedAssignmentIds.size === 1 ? "" : "s"} selected
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() =>
                setSelectedAssignmentIds(new Set(assignments.map((a) => a.assignmentId)))
              }
              className="font-medium text-accent hover:text-accent-hover"
            >
              Select all rows
            </button>
            <button
              type="button"
              onClick={() => setSelectedAssignmentIds(new Set())}
              className="font-medium text-fg-subtle hover:text-fg"
            >
              Clear
            </button>
            {selectedAssignmentIds.size === 0 ? (
              <button
                type="button"
                disabled
                className="rounded-md border border-danger/40 bg-surface px-3 py-1.5 text-xs font-medium text-danger opacity-50"
              >
                Delete selected rows
              </button>
            ) : (
              <ConfirmDialog
                trigger={
                  <button
                    type="button"
                    disabled={deletePending}
                    className="rounded-md border border-danger/40 bg-surface px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger-bg disabled:opacity-50"
                  >
                    {deletePending
                      ? "Deleting…"
                      : `Delete selected rows (${selectedAssignmentIds.size})`}
                  </button>
                }
                title={`Delete ${selectedAssignmentIds.size} technician row${
                  selectedAssignmentIds.size === 1 ? "" : "s"
                } this month?`}
                body={
                  <span>
                    Soft-deletes every selected technician&apos;s entries for this account
                    and month (recoverable). Other technicians and other months are
                    unaffected. Use this to reset rows during testing.
                  </span>
                }
                destructive
                confirmLabel="Delete selected rows"
                onConfirm={handleDeleteRows}
              />
            )}
          </div>
        </div>
      )}

      {invalidCellCount > 0 && (
        <div className="rounded-md border border-danger/40 bg-danger-bg/40 px-3 py-2 text-xs text-danger">
          {invalidCellCount} cell{invalidCellCount === 1 ? "" : "s"} have invalid
          values. Use a number 0–24 or one of <code>PH</code>, <code>AB</code>,{" "}
          <code>NA</code>, <code>PTO</code>, <code>HALF_DAY</code>. Bad cells are
          outlined in red below.
        </div>
      )}

      {invalidCellCount === 0 && blankWeekdayCount > 0 && (
        <div className="rounded-md border border-warning/40 bg-warning-bg/40 px-3 py-2 text-xs text-warning">
          {blankWeekdayCount} working-day cell
          {blankWeekdayCount === 1 ? " is" : "s are"} blank. Enter hours (0–24) or
          a status — <code>PH</code> (holiday), <code>AB</code> (absent),{" "}
          <code>NA</code> (terminated), <code>PTO</code>, <code>HALF_DAY</code>{" "}
          (0.5 day) — for every working day. Blank days are outlined in amber below.
        </div>
      )}

      <div className="glass overflow-auto rounded-lg">
        <table className="w-full border-collapse text-xs">
          <thead className="bg-surface-2">
            <tr>
              <th className="sticky left-0 z-10 min-w-[180px] border-b border-r border-border bg-surface-2 px-3 py-2 text-left">
                Technician
              </th>
              <th className="border-b border-r border-border px-2 py-2 text-right">
                Days
              </th>
              <th className="border-b border-r border-border px-2 py-2 text-right">
                OT
              </th>
              <th className="border-b border-r border-border px-2 py-2 text-right">
                Weekend
              </th>
              {days.map((d) => (
                <th
                  key={d}
                  className={`border-b border-r border-border px-1 py-2 text-center font-medium ${
                    isWeekend(d) ? "bg-surface text-fg-subtle" : ""
                  }`}
                >
                  <div className="text-[10px] uppercase tracking-wider">
                    {new Date(`${d}T00:00:00.000Z`).toLocaleString("en-US", {
                      weekday: "short",
                      timeZone: "UTC",
                    })}
                  </div>
                  <div className="tabular-nums">
                    {Number(d.slice(8))}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {assignments.map((a, idx) => {
              const summary = summaries[idx];
              const savedCount = days.reduce(
                (n, d) => (savedKeys.has(cellKey(a.assignmentId, d)) ? n + 1 : n),
                0,
              );
              return (
                <tr
                  key={a.assignmentId}
                  className={`hover:bg-surface/40 ${
                    selectedAssignmentIds.has(a.assignmentId) ? "bg-surface/60" : ""
                  }`}
                >
                  <td className="sticky left-0 z-10 border-b border-r border-border bg-bg px-3 py-2">
                    <div className="flex items-start gap-2">
                      {softDeleteEnabled && (
                        <input
                          type="checkbox"
                          checked={selectedAssignmentIds.has(a.assignmentId)}
                          onChange={() => toggleRow(a.assignmentId)}
                          aria-label={`Select ${a.technicianName}`}
                          className="mt-0.5 h-4 w-4 shrink-0 rounded border-border-strong text-accent accent-accent focus:ring-accent"
                        />
                      )}
                      <div className="min-w-0">
                        <div className="font-medium text-fg">{a.technicianName}</div>
                        <div className="text-[11px] text-fg-subtle">
                          {categoryLabel(a.category)} · Band {a.band}
                          {a.slaTier !== "NONE" ? ` · ${slaTierLabel(a.slaTier)}` : ""} ·{" "}
                          {a.location}
                          {a.contactNo ? ` · ${a.contactNo}` : ""}
                        </div>
                        <div className="text-[11px] font-medium">
                          {savedCount > 0 ? (
                            <span className="text-fg-muted">
                              {savedCount} day{savedCount === 1 ? "" : "s"} saved
                            </span>
                          ) : (
                            <span className="text-fg-subtle">Not entered yet</span>
                          )}
                        </div>
                        <div className="mt-1 flex items-center gap-3">
                          <FillRangeDialog
                            technicianName={a.technicianName}
                            days={days}
                            defaultHours={defaultHours}
                            onApply={(args) => handleFillRange(a.assignmentId, args)}
                          />
                          {softDeleteEnabled && (
                            <ConfirmDialog
                              trigger={
                                <button
                                  type="button"
                                  disabled={deletePending}
                                  className="text-[11px] font-medium text-danger hover:text-danger/80 disabled:opacity-50"
                                >
                                  Delete month
                                </button>
                              }
                              title={`Delete ${a.technicianName}'s entries this month?`}
                              body={
                                <span>
                                  Soft-deletes every day this technician has entered for this
                                  month (recoverable). Other technicians and other months are
                                  unaffected.
                                </span>
                              }
                              destructive
                              confirmLabel="Delete month"
                              onConfirm={() => handleDeleteRow(a.assignmentId)}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className={`border-b border-r border-border px-2 py-2 text-right tabular-nums${savedCount === 0 ? " text-fg-subtle/60" : ""}`}>
                    {summary.regularDays.toFixed(2)}
                  </td>
                  <td className={`border-b border-r border-border px-2 py-2 text-right tabular-nums${savedCount === 0 ? " text-fg-subtle/60" : ""}`}>
                    {summary.otHours.toFixed(2)}
                  </td>
                  <td className={`border-b border-r border-border px-2 py-2 text-right tabular-nums${savedCount === 0 ? " text-fg-subtle/60" : ""}`}>
                    {summary.weekendHours.toFixed(2)}
                  </td>
                  {days.map((d) => {
                    const key = cellKey(a.assignmentId, d);
                    const value = text[key] ?? "";
                    const parse = parsedByKey[key];
                    const isStatus = parse.kind === "status";
                    const isInvalid = parse.kind === "invalid";
                    const isBlankWeekday = blankWeekdayKeys.has(key);
                    // A numeric cell that is only the default pre-fill (not saved
                    // server-side, not typed this session) renders dimmed.
                    const isProvisional =
                      parse.kind === "value" &&
                      !savedKeys.has(key) &&
                      !editedKeys.has(key);
                    const canDeleteCell =
                      softDeleteEnabled &&
                      (parse.kind === "value" || parse.kind === "status");
                    return (
                      <td
                        key={d}
                        className={`group/cell relative border-b border-r border-border ${
                          isWeekend(d) ? "bg-surface/60" : ""
                        }`}
                      >
                        <input
                          type="text"
                          value={value}
                          onChange={(e) => handleChange(a.assignmentId, d, e)}
                          onBlur={() => handleBlur(a.assignmentId, d)}
                          aria-invalid={isInvalid || isBlankWeekday}
                          title={
                            isInvalid && parse.kind === "invalid"
                              ? parse.reason
                              : isBlankWeekday
                                ? "Working day is blank — enter hours or PH / AB / NA / PTO / HALF_DAY"
                                : undefined
                          }
                          inputMode="decimal"
                          maxLength={5}
                          className={
                            "w-12 bg-transparent px-1 py-1 text-center text-xs outline-none focus:bg-surface " +
                            (isInvalid
                              ? "rounded-sm ring-1 ring-danger text-danger"
                              : isBlankWeekday
                                ? "rounded-sm ring-1 ring-warning"
                                : isStatus
                                  ? "font-semibold text-accent"
                                  : isProvisional
                                    ? "tabular-nums text-fg-subtle/60"
                                    : "tabular-nums text-fg")
                          }
                          placeholder=""
                        />
                        {canDeleteCell && (
                          <button
                            type="button"
                            disabled={deletePending}
                            onClick={() => handleDeleteCell(a.assignmentId, d)}
                            title={`Delete ${d} (soft-delete)`}
                            aria-label={`Delete ${d}`}
                            className="absolute right-0 top-0 hidden h-3.5 w-3.5 items-center justify-center rounded-bl-sm bg-danger/80 text-[9px] font-bold leading-none text-white group-hover/cell:flex disabled:opacity-50"
                          >
                            ×
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
