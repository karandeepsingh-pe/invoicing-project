"use client";

import { useActionState, useTransition } from "react";
import { createCoverageEvent, deleteCoverageEvent } from "@/lib/actions/coverage";
import {
  FormError,
  SubmitButton,
  TextField,
} from "@/components/admin/field";
import { SearchableSelectField } from "@/components/admin/searchable-select";
import { useActionToast } from "@/lib/hooks/use-action-toast";

type AssignmentOpt = {
  id: string;
  name: string;
  slaTier: "BACKFILL" | "NO_BACKFILL" | "NONE";
  rateCategory: "DEDICATED" | "PROJECT_TM" | "DISPATCH_SCHED" | "SCHEDULED";
};

type PoolTechOpt = { id: string; label: string };

type EventRow = {
  id: string;
  date: string;
  covered: string;
  covering: string;
  hours: number;
  expenseAmount: number | null;
  expenseNotes: string | null;
  notes: string | null;
};

export function CoverageView({
  accountId,
  year,
  month,
  assignments,
  poolTechs,
  events,
}: {
  accountId: string;
  year: number;
  month: number;
  assignments: AssignmentOpt[];
  poolTechs: PoolTechOpt[];
  events: EventRow[];
}) {
  const [createState, createAction] = useActionState(createCoverageEvent, null);
  const [deleteState, deleteAction] = useActionState(deleteCoverageEvent, null);
  const [pending, startTransition] = useTransition();

  useActionToast(createState, {
    success: { title: "Coverage event added" },
    error: { fallbackTitle: "Failed to add coverage event" },
  });
  useActionToast(deleteState, {
    success: { title: "Coverage event deleted" },
    error: { fallbackTitle: "Failed to delete event" },
  });

  const fieldErrors =
    createState && createState.ok === false ? createState.fieldErrors : undefined;
  const formError =
    createState && createState.ok === false ? createState.formError : undefined;

  // Covered side: BACKFILL-tier Dedicated seats on this account. Covering side:
  // any active pool technician (loaded server-side, all accounts).
  const backfillOpts = assignments.filter(
    (a) => a.slaTier === "BACKFILL" && a.rateCategory === "DEDICATED",
  );

  function handleDelete(id: string) {
    startTransition(() => {
      const fd = new FormData();
      fd.append("id", id);
      deleteAction(fd);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <MonthPicker accountId={accountId} year={year} month={month} />

      <section className="glass overflow-hidden rounded-lg">
        <form action={createAction} className="flex flex-col gap-3 border-b border-border p-4">
          <FormError error={formError} />
          <h2 className="text-sm font-semibold tracking-tightish">Add coverage event</h2>
          {backfillOpts.length === 0 ? (
            <p className="text-sm text-fg-subtle">
              No BACKFILL-tier assignments on this account for the month. Coverage
              is only valid for BACKFILL-tier covered techs.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <SearchableSelectField
                  label="Covered technician (BACKFILL)"
                  name="coveredAssignmentId"
                  required
                  options={backfillOpts.map((a) => ({ value: a.id, label: a.name }))}
                  errors={fieldErrors?.coveredAssignmentId}
                />
                <SearchableSelectField
                  label="Covering technician (any pool tech)"
                  name="coveringTechnicianId"
                  required
                  options={poolTechs.map((t) => ({ value: t.id, label: t.label }))}
                  errors={fieldErrors?.coveringTechnicianId}
                  hint="Anyone in the active Project/Dispatch pool can cover; no assignment on this account needed. Billed at the covered tech's rates."
                />
                <TextField
                  label="Date"
                  name="date"
                  type="date"
                  required
                  errors={fieldErrors?.date}
                />
                <TextField
                  label="Hours"
                  name="hours"
                  type="number"
                  step="0.25"
                  min={0.25}
                  max={24}
                  inputMode="decimal"
                  defaultValue="8"
                  required
                  errors={fieldErrors?.hours}
                />
                <TextField
                  label="Expense $ (optional)"
                  name="expenseAmount"
                  type="number"
                  step="0.01"
                  min={0}
                  inputMode="decimal"
                  placeholder="e.g. 10"
                  errors={fieldErrors?.expenseAmount}
                  hint="Paid to the covering tech (travel, etc.) and billed to the client under Reimbursements."
                />
                <TextField
                  label="Expense note"
                  name="expenseNotes"
                  placeholder="e.g. travel"
                  errors={fieldErrors?.expenseNotes}
                />
                <TextField label="Notes" name="notes" placeholder="" />
              </div>
              <SubmitButton>Add event</SubmitButton>
            </>
          )}
        </form>

        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-xs uppercase tracking-wider text-fg-muted">
            <tr>
              <th className="px-3 py-2 text-left">Date</th>
              <th className="px-3 py-2 text-left">Covered</th>
              <th className="px-3 py-2 text-left">Covering</th>
              <th className="px-3 py-2 text-right">Hours</th>
              <th className="px-3 py-2 text-right">Expense</th>
              <th className="px-3 py-2 text-left">Notes</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id} className="border-t border-border">
                <td className="px-3 py-2 font-mono text-xs">{e.date}</td>
                <td className="px-3 py-2">{e.covered}</td>
                <td className="px-3 py-2">{e.covering}</td>
                <td className="px-3 py-2 text-right tabular-nums">{e.hours.toFixed(2)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-xs">
                  {e.expenseAmount != null
                    ? `$${e.expenseAmount.toFixed(2)}${e.expenseNotes ? ` (${e.expenseNotes})` : ""}`
                    : "—"}
                </td>
                <td className="px-3 py-2 text-xs text-fg-muted">{e.notes ?? "—"}</td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => handleDelete(e.id)}
                    className="text-xs font-medium text-danger hover:text-danger/80"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {events.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-4 text-sm text-fg-subtle">
                  No coverage events for this month.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function MonthPicker({
  accountId,
  year,
  month,
}: {
  accountId: string;
  year: number;
  month: number;
}) {
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const years = [year - 1, year, year + 1];
  return (
    <form className="flex items-center gap-3 text-sm" method="get">
      <input type="hidden" name="account" value={accountId} />
      <label className="flex items-center gap-2">
        <span className="text-fg-muted">Month</span>
        <select name="month" defaultValue={String(month)} className="glass-input rounded-md px-2 py-1">
          {months.map((m, i) => (
            <option key={m} value={i + 1}>{m}</option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2">
        <span className="text-fg-muted">Year</span>
        <select name="year" defaultValue={String(year)} className="glass-input rounded-md px-2 py-1">
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </label>
      <button type="submit" className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg hover:bg-accent-hover">Load</button>
    </form>
  );
}
