"use client";

import { useActionState, useState, useTransition } from "react";
import { DispatchWorkStatus } from "@prisma/client";
import {
  createDispatchVisit,
  deleteDispatchVisit,
} from "@/lib/actions/dispatch-visit";
import {
  FormError,
  SelectField,
  SubmitButton,
  TextField,
} from "@/components/admin/field";
import { LocationFields } from "@/components/admin/location-fields";
import { useActionToast } from "@/lib/hooks/use-action-toast";

type AssignmentOpt = {
  id: string;
  name: string;
  band: number;
  phone: string | null;
  email: string | null;
};
type SlaOpt = { id: string; code: string; label: string };
type VisitTypeOpt = { id: string; code: string; label: string };
type VisitRow = {
  id: string;
  visitDate: string;
  ticketNumber: string | null;
  hoursOnSite: number;
  workStatus: string;
  slaCode: string;
  technicianName: string;
  siteLocation: string | null;
  cityState: string | null;
  visitTypeLabel: string | null;
  window: string | null;
};

type BillingInfo = {
  billed: number;
  totalHrs: number;
  additionalHours: number;
  firstHourRate: number;
  additionalHourRate: number;
};

const statusLabel: Record<string, string> = {
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  RESCHEDULED: "Rescheduled",
  NO_SHOW: "No-show",
  PENDING: "Pending",
};

const BILLABLE_STATUSES = new Set(["COMPLETED"]);

function money(n: number, currency: string): string {
  return `${currency} ${n.toFixed(2)}`;
}

export function DispatchVisitsView({
  accountId,
  year,
  month,
  assignments,
  slas,
  visitTypes,
  visits,
  billing = {},
  currency = "USD",
  hideMonthPicker = false,
}: {
  accountId: string;
  year: number;
  month: number;
  assignments: AssignmentOpt[];
  slas: SlaOpt[];
  visitTypes: VisitTypeOpt[];
  visits: VisitRow[];
  // Rate-sheet billing per visit id (same numbers the dispatch pre-invoice uses).
  billing?: Record<string, BillingInfo>;
  currency?: string;
  // When embedded in the combined "All categories" view, the page owns the
  // month picker, so the dispatch block hides its own.
  hideMonthPicker?: boolean;
}) {
  const [createState, createAction, createPending] = useActionState(createDispatchVisit, null);
  const [deleteState, deleteAction] = useActionState(deleteDispatchVisit, null);
  const [pending, startTransition] = useTransition();
  const [assignmentId, setAssignmentId] = useState(assignments[0]?.id ?? "");

  useActionToast(createState, {
    success: { title: "Visit added" },
    error: { fallbackTitle: "Failed to add visit" },
  });
  useActionToast(deleteState, {
    success: { title: "Visit deleted" },
    error: { fallbackTitle: "Failed to delete visit" },
  });

  const fieldErrors =
    createState && createState.ok === false ? createState.fieldErrors : undefined;
  const formError =
    createState && createState.ok === false ? createState.formError : undefined;
  const needsOverride =
    createState && createState.ok === false ? createState.needsOverride : false;
  const conflicts =
    createState && createState.ok === false ? createState.conflicts ?? [] : [];

  const selected = assignments.find((a) => a.id === assignmentId);

  // Rate-sheet billing summary (identical to what the dispatch pre-invoice bills).
  const totalBilled = visits.reduce((n, v) => n + (billing[v.id]?.billed ?? 0), 0);
  const unpricedVisits = visits.filter(
    (v) =>
      BILLABLE_STATUSES.has(v.workStatus) &&
      (billing[v.id]?.billed ?? 0) === 0 &&
      (billing[v.id]?.firstHourRate ?? 0) === 0,
  );

  function handleDelete(id: string) {
    startTransition(() => {
      const fd = new FormData();
      fd.append("id", id);
      deleteAction(fd);
    });
  }

  if (assignments.length === 0) {
    return (
      <div className="glass rounded-lg p-6 text-sm text-fg-muted">
        No DISPATCH_SCHED assignments overlap this month. Add a dispatch assignment to a
        technician under this account first.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {!hideMonthPicker && <MonthPicker accountId={accountId} year={year} month={month} />}

      <section className="glass overflow-hidden rounded-lg">
        <form action={createAction} className="flex flex-col gap-4 border-b border-border p-4">
          <FormError error={formError} />
          <h2 className="text-sm font-semibold tracking-tightish">Add visit</h2>

          {/* Engineer + ticket + status */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <SelectField
              label="Engineer (Technician)"
              name="assignmentId"
              required
              value={assignmentId}
              onChange={(e) => setAssignmentId(e.target.value)}
              errors={fieldErrors?.assignmentId}
              hint={
                selected && (selected.phone || selected.email)
                  ? [selected.phone, selected.email].filter(Boolean).join(" · ")
                  : undefined
              }
            >
              {assignments.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · Band {a.band}
                </option>
              ))}
            </SelectField>
            <TextField label="Vantage Ticket" name="ticketNumber" placeholder="e.g. HCL-ZF-26-04-010035" maxLength={60} errors={fieldErrors?.ticketNumber} />
            <SelectField label="Work Status" name="workStatus" defaultValue={DispatchWorkStatus.COMPLETED} errors={fieldErrors?.workStatus}>
              {Object.values(DispatchWorkStatus).map((s) => (
                <option key={s} value={s}>{statusLabel[s] ?? s}</option>
              ))}
            </SelectField>
            <TextField label="Site Code" name="siteCode" placeholder="e.g. NMN" maxLength={40} errors={fieldErrors?.siteCode} />
          </div>

          {/* Dates + visit type */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <TextField label="Request Received Date" name="requestReceivedDate" type="date" errors={fieldErrors?.requestReceivedDate} />
            <TextField label="Proposed Onsite Date" name="proposedOnsiteDate" type="date" errors={fieldErrors?.proposedOnsiteDate} />
            <TextField label="Visit Time (proposed)" name="visitTime" type="time" errors={fieldErrors?.visitTime} />
            <SelectField label="Visit type" name="visitTypeId" errors={fieldErrors?.visitTypeId}>
              <option value="">—</option>
              {visitTypes.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </SelectField>
          </div>

          {/* Location: street (manual) + zip autofill city/state */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <TextField label="Location (street, manual)" name="siteLocation" placeholder="e.g. 1911 Lee Boulevard" maxLength={160} errors={fieldErrors?.siteLocation} />
          </div>
          <LocationFields
            fieldErrors={{
              zipcode: fieldErrors?.zipcode,
              locationCity: fieldErrors?.locationCity,
              locationState: fieldErrors?.locationState,
              locationCountry: fieldErrors?.locationCountry,
            }}
          />

          {/* Visit date + in/out + hours + SLA */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <TextField label="Visit date" name="visitDate" type="date" required errors={fieldErrors?.visitDate} />
            <TextField label="In-Time" name="inTime" type="time" errors={fieldErrors?.inTime} hint="Feeds the overlap calendar." />
            <TextField label="Out-Time" name="outTime" type="time" errors={fieldErrors?.outTime} />
            <TextField
              label="Total Hrs"
              name="hoursOnSite"
              type="number"
              step="0.25"
              min={0}
              max={24}
              inputMode="decimal"
              required
              defaultValue="1"
              errors={fieldErrors?.hoursOnSite}
              hint="Manual. Billed = 1st-hr + (Total−1)×add'l."
            />
            <SelectField label="SLA" name="slaId" required errors={fieldErrors?.slaId}>
              {slas.map((s) => (
                <option key={s.id} value={s.id}>{s.code} — {s.label}</option>
              ))}
            </SelectField>
            <TextField label="OOO Hrs" name="oooHrs" type="number" step="0.25" min={0} max={24} errors={fieldErrors?.oooHrs} />
            <label className="flex items-end gap-2 text-sm">
              <input type="checkbox" name="afterHours" className="h-4 w-4 rounded border-border-strong text-accent accent-accent focus:ring-accent" />
              <span className="text-fg-muted">After-hours uplift</span>
            </label>
            <label className="flex items-end gap-2 text-sm">
              <input type="checkbox" name="weekend" className="h-4 w-4 rounded border-border-strong text-accent accent-accent focus:ring-accent" />
              <span className="text-fg-muted">Weekend uplift</span>
            </label>
          </div>

          {/* Travel + parts + notes */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <TextField label="Travel hours" name="travelHours" type="number" step="0.25" min={0} errors={fieldErrors?.travelHours} />
            <TextField label="Travel miles" name="travelMiles" type="number" step="1" min={0} errors={fieldErrors?.travelMiles} />
            <TextField label="Parts amount" name="partsAmount" type="number" step="0.01" min={0} errors={fieldErrors?.partsAmount} />
            <TextField label="Reimbursement notes" name="reimbursementNotes" errors={fieldErrors?.reimbursementNotes} />
          </div>
          <TextField label="Notes" name="notes" errors={fieldErrors?.notes} />

          {needsOverride && (
            <div className="flex flex-col gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-3 text-xs text-amber-700 dark:text-amber-300">
              <p className="font-semibold">Time-slot conflict for this technician:</p>
              <ul className="list-disc pl-5">
                {conflicts.map((c, i) => (
                  <li key={i}>
                    {c.kind} · {fmtTime(c.startDateTime)}–{fmtTime(c.endDateTime)} · {c.accountLabel}
                  </li>
                ))}
              </ul>
              <input name="overrideReason" placeholder="Reason for override (logged)" className="glass-input rounded-md px-2 py-1 text-xs text-fg" />
              <button
                type="submit"
                name="override"
                value="true"
                disabled={createPending}
                className="self-start rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {createPending ? "Saving…" : "Save anyway (override)"}
              </button>
            </div>
          )}

          <SubmitButton>Add visit</SubmitButton>
        </form>

        {unpricedVisits.length > 0 && (
          <div className="border-b border-border bg-warning-bg/40 px-4 py-2 text-xs text-warning">
            {unpricedVisits.length} billable visit{unpricedVisits.length === 1 ? "" : "s"} have no rate
            (no First Hour rate on the rate sheet for that SLA at Band 2) and bill $0. Add the dispatch
            rates so they price.
          </div>
        )}

        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-xs uppercase tracking-wider text-fg-subtle">
            <tr>
              <th className="px-3 py-2 text-left">Date</th>
              <th className="px-3 py-2 text-left">Engineer</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Location</th>
              <th className="px-3 py-2 text-left">SLA</th>
              <th className="px-3 py-2 text-left">Ticket</th>
              <th className="px-3 py-2 text-right">Total Hrs</th>
              <th className="px-3 py-2 text-right">After 1st Hr</th>
              <th className="px-3 py-2 text-right">Billed</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {visits.map((v) => {
              const b = billing[v.id];
              const billable = BILLABLE_STATUSES.has(v.workStatus);
              const unpriced = billable && (b?.billed ?? 0) === 0 && (b?.firstHourRate ?? 0) === 0;
              const basis =
                b && (b.firstHourRate > 0 || b.additionalHourRate > 0)
                  ? `1st hr ${b.firstHourRate} + ${b.additionalHours.toFixed(2)} × ${b.additionalHourRate}`
                  : undefined;
              return (
                <tr key={v.id} className={"border-t border-border" + (unpriced ? " bg-warning-bg/30" : "")}>
                  <td className="px-3 py-2 font-mono text-xs">{v.visitDate}</td>
                  <td className="px-3 py-2">{v.technicianName}</td>
                  <td className="px-3 py-2 text-fg-muted">{statusLabel[v.workStatus] ?? v.workStatus}</td>
                  <td className="px-3 py-2 text-fg-muted">
                    {[v.siteLocation, v.cityState].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td className="px-3 py-2 text-fg-muted">{v.slaCode}</td>
                  <td className="px-3 py-2 text-fg-muted">{v.ticketNumber ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{v.hoursOnSite.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-fg-muted">
                    {b ? b.additionalHours.toFixed(2) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums" title={basis}>
                    {!billable ? (
                      <span className="text-fg-subtle">—</span>
                    ) : unpriced ? (
                      <span className="text-warning">unpriced</span>
                    ) : (
                      money(b?.billed ?? 0, currency)
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => handleDelete(v.id)}
                      className="text-xs font-medium text-danger hover:text-danger/80"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
            {visits.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-4 text-sm text-fg-subtle">
                  No visits for this month yet.
                </td>
              </tr>
            )}
            {visits.length > 0 && (
              <tr className="border-t-2 border-border bg-surface-2 font-semibold">
                <td className="px-3 py-2" colSpan={8}>
                  Total billable
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{money(totalBilled, currency)}</td>
                <td></td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    hour12: false,
  });
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
