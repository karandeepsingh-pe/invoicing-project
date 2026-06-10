"use client";

import { useActionState, useTransition } from "react";
import { createCoverageEvent, deleteCoverageEvent } from "@/lib/actions/coverage";
import {
  FormError,
  SelectField,
  SubmitButton,
  TextField,
} from "@/components/admin/field";
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
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <SelectField
                  label="Covered technician (BACKFILL)"
                  name="coveredAssignmentId"
                  required
                  errors={fieldErrors?.coveredAssignmentId}
                >
                  {backfillOpts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  label="Covering technician (any pool tech)"
                  name="coveringTechnicianId"
                  required
                  errors={fieldErrors?.coveringTechnicianId}
                  hint="Active Project/Dispatch pool — no assignment on this account needed. Bills at the covered tech's rates."
                >
                  {poolTechs.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </SelectField>
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
                <TextField label="Notes" name="notes" placeholder="" />
              </div>
              <SubmitButton>Add event</SubmitButton>
            </>
          )}
        </form>

        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-xs uppercase tracking-wider text-fg-subtle">
            <tr>
              <th className="px-3 py-2 text-left">Date</th>
              <th className="px-3 py-2 text-left">Covered</th>
              <th className="px-3 py-2 text-left">Covering</th>
              <th className="px-3 py-2 text-right">Hours</th>
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
                <td colSpan={6} className="px-3 py-4 text-sm text-fg-subtle">
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
