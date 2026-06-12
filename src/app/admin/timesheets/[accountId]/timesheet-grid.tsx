"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
} from "react";
import { useRouter } from "next/navigation";
import { saveTimesheetCells } from "@/lib/actions/timesheet";
import {
  softDeleteTimesheetCell,
  softDeleteTimesheetRowMonth,
  softDeleteTimesheetRowsMonth,
} from "@/lib/actions/soft-delete";
import { useActionToast } from "@/lib/hooks/use-action-toast";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { FilterInput } from "@/components/admin/filter-input";
import { filterByText } from "@/lib/display/option-filter";
import {
  normalizeCellText,
  parseCellText,
  statusDayCredit,
  type CellParse,
} from "@/lib/validation/cell";
import {
  cellToText,
  isWeekend,
  reconcileDedicatedCellText,
  type GridCell,
} from "@/lib/validation/cell-display";
import { daysInFillRange } from "@/lib/domain/timesheet-month";
import { FillRangeDialog } from "./fill-range-dialog";

export type { GridCell };

export type GridAssignment = {
  assignmentId: string;
  technicianName: string;
  category: "DEDICATED" | "PROJECT_TM" | "SCHEDULED";
  contactNo?: string;
  location: string;
  band: number;
  slaTier: "BACKFILL" | "NO_BACKFILL" | "NONE";
};

// A cell to persist via the autosave action: an upsert (value/status) or a clear.
type PersistCell =
  | { assignmentId: string; date: string; hours: number | null; status: GridCell["status"] }
  | { assignmentId: string; date: string; clear: true };

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

export function TimesheetGrid({
  accountId,
  defaultHours,
  assignments,
  days,
  initialCells,
  softDeleteEnabled = false,
  holidayDates = [],
  prefillHolidaysAsPh = false,
  prefillDefaultHours = false,
  year,
  month,
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
  // When true (Dedicated only), un-entered weekdays pre-fill the account default
  // hours and are auto-committed on load. Project/Scheduled (specific-day
  // engagements) leave un-entered weekdays blank.
  prefillDefaultHours?: boolean;
}) {
  const [text, setText] = useState<RawText>(() => {
    const holidaySet = new Set(prefillHolidaysAsPh ? holidayDates : []);
    const out: RawText = {};
    for (const a of assignments) {
      for (const d of days) {
        const key = cellKey(a.assignmentId, d);
        const saved = initialCells[key];
        if (prefillHolidaysAsPh) {
          // Dedicated: the live holiday master is authoritative over an untouched
          // snapshot (so PH tracks add/move/delete), but real work wins.
          out[key] = reconcileDedicatedCellText({
            saved,
            isHoliday: holidaySet.has(d),
            weekend: isWeekend(d),
            defaultHours,
            prefillDefaultHours,
          });
        } else if (saved !== undefined) {
          out[key] = cellToText(saved);
        } else if (isWeekend(d)) {
          out[key] = "";
        } else if (prefillDefaultHours) {
          out[key] = String(defaultHours);
        } else {
          out[key] = "";
        }
      }
    }
    return out;
  });

  // The last value persisted to the DB per cell ("" = not persisted). The grid
  // autosaves a cell whenever its normalized text differs from this.
  const [savedText, setSavedText] = useState<RawText>(() => {
    const out: RawText = {};
    for (const a of assignments) {
      for (const d of days) {
        const key = cellKey(a.assignmentId, d);
        const saved = initialCells[key];
        out[key] = saved !== undefined ? cellToText(saved) : "";
      }
    }
    return out;
  });

  const [savingCount, setSavingCount] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);

  const router = useRouter();
  const [deleteState, setDeleteState] = useState<
    { ok: true; message?: string } | { ok: false; formError?: string } | null
  >(null);
  const [deletePending, startDeleteTransition] = useTransition();
  const [selectedAssignmentIds, setSelectedAssignmentIds] = useState<Set<string>>(
    () => new Set(),
  );
  // Display-only row filter: autosave, summaries, and blank-cell checks always
  // run over the full assignment list regardless of what's visible.
  const [rowQuery, setRowQuery] = useState("");
  const visibleAssignments = useMemo(
    () => filterByText(assignments, rowQuery, (a) => a.technicianName),
    [assignments, rowQuery],
  );

  useActionToast(deleteState, {
    success: { title: "Deleted" },
    error: { fallbackTitle: "Delete failed" },
  });

  // Persist a batch of cells (per-cell, fill-range, or the on-load default commit).
  // Optimistically marks them saved on success; never triggers a page refresh.
  const persist = useCallback(
    (cells: PersistCell[], savedValues: RawText) => {
      if (cells.length === 0) return;
      setSavingCount((n) => n + 1);
      void (async () => {
        const fd = new FormData();
        fd.append("payload", JSON.stringify({ accountId, cells }));
        const result = await saveTimesheetCells(null, fd);
        setSavingCount((n) => Math.max(0, n - 1));
        if (result && result.ok) {
          setSaveError(null);
          setSavedText((prev) => ({ ...prev, ...savedValues }));
        } else {
          setSaveError(
            result && result.ok === false
              ? result.formError ?? "Autosave failed — changes not stored"
              : "Autosave failed — changes not stored",
          );
        }
      })();
    },
    [accountId],
  );

  // On load, converge the DB to the reconciled display: commit pre-filled defaults
  // (Dedicated default hours + holiday PH) AND heal stale holiday snapshots — a cell
  // whose reconciled text differs from what is persisted (e.g. a deleted holiday's
  // leftover PH reverting to default, or a newly-added holiday flipping a default-8
  // day to PH). Project/Scheduled have no defaults/holidays, so this stays a no-op
  // for them. Runs once.
  const didInitialPersist = useRef(false);
  useEffect(() => {
    if (didInitialPersist.current) return;
    didInitialPersist.current = true;
    const cells: PersistCell[] = [];
    const savedValues: RawText = {};
    for (const a of assignments) {
      for (const d of days) {
        const key = cellKey(a.assignmentId, d);
        const norm = normalizeCellText(text[key] ?? "");
        if (norm === (savedText[key] ?? "")) continue; // already in sync with the DB
        const p = parseCellText(norm);
        if (p.kind === "value") {
          cells.push({ assignmentId: a.assignmentId, date: d, hours: p.hours, status: null });
        } else if (p.kind === "status") {
          cells.push({ assignmentId: a.assignmentId, date: d, hours: null, status: p.status });
        } else if (p.kind === "blank" && (savedText[key] ?? "") !== "") {
          cells.push({ assignmentId: a.assignmentId, date: d, clear: true });
        } else {
          continue;
        }
        savedValues[key] = norm;
      }
    }
    if (cells.length > 0) persist(cells, savedValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleRow(assignmentId: string) {
    setSelectedAssignmentIds((prev) => {
      const next = new Set(prev);
      if (next.has(assignmentId)) next.delete(assignmentId);
      else next.add(assignmentId);
      return next;
    });
  }

  // After a successful soft-delete, revert affected cells to their un-entered look
  // (Dedicated weekday -> default hours, else blank) and mark them un-persisted.
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
        next[key] = isWeekend(date) ? "" : prefillDefaultHours ? String(defaultHours) : "";
      }
      return next;
    });
    setSavedText((prev) => {
      const next = { ...prev };
      for (const key of affectedKeys) next[key] = "";
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

  // Blank weekdays are only flagged for Dedicated (every weekday is a work day). For
  // Project/Scheduled, a blank weekday legitimately means "not worked".
  const blankWeekdayKeys = useMemo(() => {
    const out = new Set<string>();
    if (!prefillDefaultHours) return out;
    for (const a of assignments) {
      for (const d of days) {
        if (isWeekend(d)) continue;
        const key = cellKey(a.assignmentId, d);
        if (parsedByKey[key].kind === "blank") out.add(key);
      }
    }
    return out;
  }, [assignments, days, parsedByKey, prefillDefaultHours]);

  const blankWeekdayCount = blankWeekdayKeys.size;

  // Cells whose current value differs from what is persisted (and are valid).
  const dirtyCount = useMemo(() => {
    let n = 0;
    for (const a of assignments) {
      for (const d of days) {
        const key = cellKey(a.assignmentId, d);
        if (parsedByKey[key].kind === "invalid") continue;
        if (normalizeCellText(text[key] ?? "") !== (savedText[key] ?? "")) n += 1;
      }
    }
    return n;
  }, [assignments, days, text, savedText, parsedByKey]);

  const summaries = useMemo(() => {
    return assignments.map((a) => {
      let regularDays = 0;
      let otHours = 0;
      let weekendHours = 0;
      for (const d of days) {
        const p = parsedByKey[cellKey(a.assignmentId, d)];
        if (p.kind === "status") {
          // Mirror the invoice engine (hours-split.ts) so the displayed "Days"
          // matches what is billed. For Dedicated (prefillDefaultHours) PH/PTO
          // credit a full paid day, HALF_DAY 0.5, AB/NA 0. For Project/Scheduled
          // the "Days" column is informational and unchanged (HALF_DAY only).
          if (prefillDefaultHours) {
            regularDays += statusDayCredit(p.status);
          } else if (p.status === "HALF_DAY") {
            regularDays += 0.5;
          }
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
      return { assignmentId: a.assignmentId, regularDays, otHours, weekendHours };
    });
  }, [assignments, days, defaultHours, parsedByKey, prefillDefaultHours]);

  // Row rendering filters by technician, so summaries must be looked up by id —
  // the positional zip against the full list would misalign.
  const summaryById = useMemo(
    () => new Map(summaries.map((s) => [s.assignmentId, s])),
    [summaries],
  );

  function handleChange(
    assignmentId: string,
    date: string,
    e: ChangeEvent<HTMLInputElement>,
  ) {
    const key = cellKey(assignmentId, date);
    setText((prev) => ({ ...prev, [key]: e.target.value }));
  }

  // Per-row "Fill range": write one value/status into every day in a range, then
  // autosave the filled cells.
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
    const p = parseCellText(norm);
    if (p.kind === "invalid") return;
    const cells: PersistCell[] = [];
    const savedValues: RawText = {};
    for (const d of targetDays) {
      const key = cellKey(assignmentId, d);
      if (p.kind === "blank") {
        if ((savedText[key] ?? "") !== "") {
          cells.push({ assignmentId, date: d, clear: true });
          savedValues[key] = "";
        }
      } else if (p.kind === "status") {
        cells.push({ assignmentId, date: d, hours: null, status: p.status });
        savedValues[key] = norm;
      } else {
        cells.push({ assignmentId, date: d, hours: p.hours, status: null });
        savedValues[key] = norm;
      }
    }
    persist(cells, savedValues);
  }

  // On blur: normalize the cell, then autosave it if it changed from the persisted
  // value. Invalid values are not saved (the red ring prompts a fix).
  function handleBlur(assignmentId: string, date: string) {
    const key = cellKey(assignmentId, date);
    const raw = text[key] ?? "";
    const normalized = normalizeCellText(raw);
    if (normalized !== raw) {
      setText((prev) => ({ ...prev, [key]: normalized }));
    }
    const prevSaved = savedText[key] ?? "";
    if (normalized === prevSaved) return;
    const p = parseCellText(normalized);
    if (p.kind === "invalid") return;
    if (p.kind === "blank") {
      if (prevSaved === "") return; // nothing to clear
      persist([{ assignmentId, date, clear: true }], { [key]: "" });
      return;
    }
    const cell: PersistCell =
      p.kind === "status"
        ? { assignmentId, date, hours: null, status: p.status }
        : { assignmentId, date, hours: p.hours, status: null };
    persist([cell], { [key]: normalized });
  }

  const saveStatus = saveError ? (
    <span className="text-danger">{saveError}</span>
  ) : savingCount > 0 ? (
    <span className="text-fg-muted">Saving…</span>
  ) : dirtyCount > 0 ? (
    <span className="text-fg-muted">{dirtyCount} unsaved</span>
  ) : (
    <span className="text-success">All changes saved</span>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-fg-subtle">
          Autosaves as you type ·{" "}
          {rowQuery.trim() !== ""
            ? `${visibleAssignments.length} of ${assignments.length} technicians`
            : `${assignments.length} technician${assignments.length === 1 ? "" : "s"}`}{" "}
          · {days.length} days
        </div>
        <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
          <FilterInput
            value={rowQuery}
            onChange={setRowQuery}
            placeholder="Search technician…"
            className="w-full sm:w-56"
            inputClassName="py-1 text-xs"
          />
          <div className="text-xs font-medium">{saveStatus}</div>
        </div>
      </div>

      {softDeleteEnabled && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border-strong bg-surface px-3 py-2 text-xs">
          <span className="font-medium text-fg">
            {selectedAssignmentIds.size} row{selectedAssignmentIds.size === 1 ? "" : "s"} selected
            {(() => {
              if (rowQuery.trim() === "") return null;
              const visibleIds = new Set(visibleAssignments.map((a) => a.assignmentId));
              const hidden = [...selectedAssignmentIds].filter((id) => !visibleIds.has(id)).length;
              return hidden > 0 ? ` (${hidden} hidden by search)` : null;
            })()}
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() =>
                setSelectedAssignmentIds(
                  (prev) => new Set([...prev, ...visibleAssignments.map((a) => a.assignmentId)]),
                )
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
          outlined in red below and are not saved until fixed.
        </div>
      )}

      {invalidCellCount === 0 && blankWeekdayCount > 0 && (
        <div className="rounded-md border border-warning/40 bg-warning-bg/40 px-3 py-2 text-xs text-warning">
          {blankWeekdayCount} working-day cell
          {blankWeekdayCount === 1 ? " is" : "s are"} blank. Enter hours (0–24) or
          a status — <code>PH</code> (holiday), <code>AB</code> (absent),{" "}
          <code>NA</code> (terminated), <code>PTO</code>, <code>HALF_DAY</code>{" "}
          (0.5 day). Blank days are outlined in amber below.
        </div>
      )}

      <div className="glass overflow-auto rounded-lg">
        <table className="w-full border-collapse text-xs">
          <thead className="bg-surface-2">
            <tr>
              <th className="sticky left-0 z-10 min-w-[140px] max-w-[45vw] border-b border-r border-border bg-surface-2 px-2.5 py-1.5 text-left text-[10px] font-semibold uppercase tracking-[0.18em] text-fg-muted sm:min-w-[170px] sm:max-w-none">
                Technician
              </th>
              <th className="border-b border-r border-border px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-[0.18em] text-fg-muted">Days</th>
              <th className="border-b border-r border-border px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-[0.18em] text-fg-muted">OT</th>
              <th className="border-b border-r border-border px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-[0.18em] text-fg-muted">Wknd</th>
              {days.map((d) => (
                <th
                  key={d}
                  className={`border-b border-r border-border/60 px-1 py-1.5 text-center font-medium ${
                    isWeekend(d) ? "bg-surface-2/70 text-fg-subtle" : ""
                  }`}
                >
                  <div className="text-[9px] uppercase tracking-wider text-fg-subtle">
                    {new Date(`${d}T00:00:00.000Z`)
                      .toLocaleString("en-US", { weekday: "short", timeZone: "UTC" })
                      .slice(0, 2)}
                  </div>
                  <div className="text-xs tabular-nums">{Number(d.slice(8))}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleAssignments.length === 0 && (
              <tr>
                <td
                  colSpan={4 + days.length}
                  className="px-3 py-4 text-sm text-fg-subtle"
                >
                  No technicians match &ldquo;{rowQuery}&rdquo; — clear the search to see all rows.
                </td>
              </tr>
            )}
            {visibleAssignments.map((a) => {
              const summary = summaryById.get(a.assignmentId);
              if (!summary) return null;
              const savedCount = days.reduce(
                (n, d) =>
                  (savedText[cellKey(a.assignmentId, d)] ?? "") !== "" ? n + 1 : n,
                0,
              );
              return (
                <tr
                  key={a.assignmentId}
                  className={`hover:bg-surface/40 ${
                    selectedAssignmentIds.has(a.assignmentId) ? "bg-surface/60" : ""
                  }`}
                >
                  <td className="sticky left-0 z-10 max-w-[45vw] border-b border-r border-border bg-bg px-2.5 py-1.5 sm:max-w-none">
                    <div className="flex items-center gap-2">
                      {softDeleteEnabled && (
                        <input
                          type="checkbox"
                          checked={selectedAssignmentIds.has(a.assignmentId)}
                          onChange={() => toggleRow(a.assignmentId)}
                          aria-label={`Select ${a.technicianName}`}
                          className="h-3.5 w-3.5 shrink-0 rounded border-border-strong text-accent accent-accent focus:ring-accent"
                        />
                      )}
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-medium leading-tight text-fg">
                          {a.technicianName}
                        </div>
                        <div className="flex items-center gap-2 whitespace-nowrap text-[10px] leading-tight">
                          <span className="uppercase tracking-wider text-fg-subtle">
                            {categoryLabel(a.category)} · B{a.band}
                            {a.slaTier !== "NONE" ? ` · ${slaTierLabel(a.slaTier)}` : ""}
                          </span>
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
                                  className="text-[10px] font-medium text-danger transition-colors hover:text-danger/80 disabled:opacity-50"
                                >
                                  Delete
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
                  <td className={`border-b border-r border-border px-2 py-1.5 text-right tabular-nums${savedCount === 0 ? " text-fg-subtle/60" : ""}`}>
                    {summary.regularDays.toFixed(2)}
                  </td>
                  <td className={`border-b border-r border-border px-2 py-1.5 text-right tabular-nums${savedCount === 0 ? " text-fg-subtle/60" : ""}`}>
                    {summary.otHours.toFixed(2)}
                  </td>
                  <td className={`border-b border-r border-border px-2 py-1.5 text-right tabular-nums${savedCount === 0 ? " text-fg-subtle/60" : ""}`}>
                    {summary.weekendHours.toFixed(2)}
                  </td>
                  {days.map((d) => {
                    const key = cellKey(a.assignmentId, d);
                    const value = text[key] ?? "";
                    const parse = parsedByKey[key];
                    const isStatus = parse.kind === "status";
                    const isInvalid = parse.kind === "invalid";
                    const isBlankWeekday = blankWeekdayKeys.has(key);
                    const isUnsaved =
                      parse.kind !== "invalid" &&
                      normalizeCellText(value) !== (savedText[key] ?? "");
                    const isProvisional =
                      (parse.kind === "value" || parse.kind === "status") && isUnsaved;
                    const canDeleteCell =
                      softDeleteEnabled &&
                      (parse.kind === "value" || parse.kind === "status");
                    return (
                      <td
                        key={d}
                        className={`group/cell relative border-b border-r border-border/60 ${
                          isWeekend(d) ? "bg-surface-2/50" : ""
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
                            "w-10 bg-transparent px-0.5 py-1 text-center text-xs outline-none focus:bg-surface focus:ring-1 focus:ring-accent/40 " +
                            (isInvalid
                              ? "rounded-sm ring-1 ring-danger text-danger"
                              : isBlankWeekday
                                ? "rounded-sm ring-1 ring-warning"
                                : isStatus
                                  ? `font-semibold text-accent${isProvisional ? " opacity-60" : ""}`
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
                            className="absolute right-0 top-0 hidden h-3.5 w-3.5 items-center justify-center rounded-bl-sm bg-danger/80 text-[9px] font-bold leading-none text-bg group-hover/cell:flex disabled:opacity-50"
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
