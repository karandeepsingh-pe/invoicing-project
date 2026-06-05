"use client";

import { useActionState, useEffect, useState } from "react";
import { DispatchWorkStatus } from "@prisma/client";
import { Dialog } from "@/components/admin/dialog";
import { FormError, SelectField, SubmitButton, TextField } from "@/components/admin/field";
import { LocationFields } from "@/components/admin/location-fields";
import { updateDispatchVisit } from "@/lib/actions/dispatch-visit";
import { useActionToast } from "@/lib/hooks/use-action-toast";

export type EditVisitData = {
  id: string;
  assignmentId: string;
  slaId: string;
  visitTypeId: string | null;
  workStatus: string;
  ticketNumber: string | null;
  hoursOnSite: number;
  oooHrs: number | null;
  afterHours: boolean;
  weekend: boolean;
  inTime: string | null;
  outTime: string | null;
  visitDate: string;
  requestReceivedDate: string | null;
  proposedOnsiteDate: string | null;
  visitTime: string | null;
  siteCode: string | null;
  siteLocation: string | null;
  zipcode: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postalCodeId: string | null;
  travelHours: number | null;
  travelMiles: number | null;
  partsAmount: number | null;
  reimbursementNotes: string | null;
  notes: string | null;
};

type AssignmentOpt = { id: string; name: string; band: number };
type SlaOpt = { id: string; code: string; label: string; priced: boolean };
type VisitTypeOpt = { id: string; code: string; label: string };

type Props = {
  visit: EditVisitData;
  assignments: AssignmentOpt[];
  slas: SlaOpt[];
  visitTypes: VisitTypeOpt[];
  businessHours: { start: string; end: string } | null;
};

const statusLabel: Record<string, string> = {
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  RESCHEDULED: "Rescheduled",
  NO_SHOW: "No-show",
  PENDING: "Pending",
};

/** Hours between two "HH:mm" times (same day, out > in), else null. */
function diffHours(inT: string, outT: string): string | null {
  const a = /^(\d{2}):(\d{2})$/.exec(inT);
  const b = /^(\d{2}):(\d{2})$/.exec(outT);
  if (!a || !b) return null;
  const mins = (Number(b[1]) * 60 + Number(b[2])) - (Number(a[1]) * 60 + Number(a[2]));
  if (mins <= 0) return null;
  return String(mins / 60);
}

export function EditDispatchVisitDialog(props: Props) {
  return (
    <Dialog
      trigger={
        <button type="button" className="text-xs font-medium text-fg-muted hover:text-accent">
          Edit
        </button>
      }
      title="Edit visit"
      description="Update this dispatch visit; the charge recomputes from the rate sheet."
      size="xl"
    >
      {({ close }) => <EditVisitForm {...props} close={close} />}
    </Dialog>
  );
}

function EditVisitForm({ visit, assignments, slas, visitTypes, businessHours, close }: Props & { close: () => void }) {
  const [state, action] = useActionState(updateDispatchVisit, null);
  const [assignmentId, setAssignmentId] = useState(visit.assignmentId);
  const [slaId, setSlaId] = useState(visit.slaId);
  const [visitDate, setVisitDate] = useState(visit.visitDate);
  const [inTime, setInTime] = useState(visit.inTime ?? "");
  const [outTime, setOutTime] = useState(visit.outTime ?? "");
  const [hoursOnSite, setHoursOnSite] = useState(String(visit.hoursOnSite));
  const [oooHrs, setOooHrs] = useState(visit.oooHrs != null ? String(visit.oooHrs) : "");
  const [afterHours, setAfterHours] = useState(visit.afterHours);
  const [weekend, setWeekend] = useState(visit.weekend);

  useActionToast(state, {
    success: { title: "Visit updated" },
    error: { fallbackTitle: "Failed to update visit" },
  });

  useEffect(() => {
    if (state && state.ok) close();
  }, [state, close]);

  const fieldErrors = state && state.ok === false ? state.fieldErrors : undefined;
  const formError = state && state.ok === false ? state.formError : undefined;
  const needsOverride = state && state.ok === false ? state.needsOverride : false;
  const conflicts = state && state.ok === false ? state.conflicts ?? [] : [];

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={visit.id} />
      <FormError error={formError} />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <SelectField label="Engineer" name="assignmentId" required value={assignmentId} onChange={(e) => setAssignmentId(e.target.value)} errors={fieldErrors?.assignmentId}>
          {assignments.map((a) => (
            <option key={a.id} value={a.id}>{a.name} · Band {a.band}</option>
          ))}
        </SelectField>
        <TextField label="Vantage Ticket" name="ticketNumber" defaultValue={visit.ticketNumber ?? ""} maxLength={60} errors={fieldErrors?.ticketNumber} />
        <SelectField label="Work Status" name="workStatus" defaultValue={visit.workStatus} errors={fieldErrors?.workStatus}>
          {Object.values(DispatchWorkStatus).map((s) => (
            <option key={s} value={s}>{statusLabel[s] ?? s}</option>
          ))}
        </SelectField>
        <TextField label="Site Code" name="siteCode" defaultValue={visit.siteCode ?? ""} maxLength={40} errors={fieldErrors?.siteCode} />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <TextField label="Request Received Date" name="requestReceivedDate" type="date" defaultValue={visit.requestReceivedDate ?? ""} errors={fieldErrors?.requestReceivedDate} />
        <TextField label="Proposed Onsite Date" name="proposedOnsiteDate" type="date" defaultValue={visit.proposedOnsiteDate ?? ""} errors={fieldErrors?.proposedOnsiteDate} />
        <TextField label="Visit Time (proposed)" name="visitTime" type="time" defaultValue={visit.visitTime ?? ""} errors={fieldErrors?.visitTime} />
        <SelectField label="Visit type" name="visitTypeId" defaultValue={visit.visitTypeId ?? ""} errors={fieldErrors?.visitTypeId}>
          <option value="">—</option>
          {visitTypes.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </SelectField>
      </div>

      <TextField label="Location (street, manual)" name="siteLocation" defaultValue={visit.siteLocation ?? ""} maxLength={160} errors={fieldErrors?.siteLocation} />
      <LocationFields
        initialZipcode={visit.zipcode ?? ""}
        initialCity={visit.city ?? ""}
        initialState={visit.state ?? ""}
        initialCountry={visit.country ?? ""}
        initialPostalCodeId={visit.postalCodeId}
        fieldErrors={{
          zipcode: fieldErrors?.zipcode,
          locationCity: fieldErrors?.locationCity,
          locationState: fieldErrors?.locationState,
          locationCountry: fieldErrors?.locationCountry,
        }}
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <TextField label="Visit date" name="visitDate" type="date" required value={visitDate} onChange={(e) => setVisitDate(e.target.value)} errors={fieldErrors?.visitDate} />
        <TextField
          label="In-Time"
          name="inTime"
          type="time"
          required={!!businessHours}
          value={inTime}
          onChange={(e) => { const v = e.target.value; setInTime(v); const h = diffHours(v, outTime); if (h) setHoursOnSite(h); }}
          errors={fieldErrors?.inTime}
        />
        <TextField
          label="Out-Time"
          name="outTime"
          type="time"
          required={!!businessHours}
          value={outTime}
          onChange={(e) => { const v = e.target.value; setOutTime(v); const h = diffHours(inTime, v); if (h) setHoursOnSite(h); }}
          errors={fieldErrors?.outTime}
        />
        <TextField label="Total Hrs" name="hoursOnSite" type="number" step="0.25" min={0} max={24} required value={hoursOnSite} onChange={(e) => setHoursOnSite(e.target.value)} errors={fieldErrors?.hoursOnSite} hint="Auto-fills from In/Out." />
        <SelectField label="SLA" name="slaId" required value={slaId} onChange={(e) => setSlaId(e.target.value)} errors={fieldErrors?.slaId}>
          {slas.map((s) => (
            <option key={s.id} value={s.id} disabled={!s.priced}>{s.code} — {s.label}{s.priced ? "" : " (no rate)"}</option>
          ))}
        </SelectField>
        <TextField label="OOO Hrs" name="oooHrs" type="number" step="0.25" min={0} max={24} value={oooHrs} onChange={(e) => setOooHrs(e.target.value)} errors={fieldErrors?.oooHrs} />
        <label className="flex items-end gap-2 text-sm">
          <input type="checkbox" name="afterHours" checked={afterHours} onChange={(e) => setAfterHours(e.target.checked)} className="h-4 w-4 rounded border-border-strong text-accent accent-accent" />
          <span className="text-fg-muted">After-hours</span>
        </label>
        <label className="flex items-end gap-2 text-sm">
          <input type="checkbox" name="weekend" checked={weekend} onChange={(e) => setWeekend(e.target.checked)} className="h-4 w-4 rounded border-border-strong text-accent accent-accent" />
          <span className="text-fg-muted">Weekend</span>
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <TextField label="Travel hours" name="travelHours" type="number" step="0.25" min={0} defaultValue={visit.travelHours ?? ""} errors={fieldErrors?.travelHours} />
        <TextField label="Travel miles" name="travelMiles" type="number" step="1" min={0} defaultValue={visit.travelMiles ?? ""} errors={fieldErrors?.travelMiles} />
        <TextField label="Parts amount" name="partsAmount" type="number" step="0.01" min={0} defaultValue={visit.partsAmount ?? ""} errors={fieldErrors?.partsAmount} />
        <TextField label="Reimbursement notes" name="reimbursementNotes" defaultValue={visit.reimbursementNotes ?? ""} errors={fieldErrors?.reimbursementNotes} />
      </div>
      <TextField label="Notes" name="notes" defaultValue={visit.notes ?? ""} errors={fieldErrors?.notes} />

      {needsOverride && (
        <div className="flex flex-col gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-3 text-xs text-amber-700 dark:text-amber-300">
          <p className="font-semibold">Time-slot conflict for this technician:</p>
          <ul className="list-disc pl-5">
            {conflicts.map((c, i) => (
              <li key={i}>{c.kind} · {c.accountLabel}</li>
            ))}
          </ul>
          <input name="overrideReason" placeholder="Reason for override (logged)" className="glass-input rounded-md px-2 py-1 text-xs text-fg" />
          <button type="submit" name="override" value="true" className="self-start rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700">
            Save anyway (override)
          </button>
        </div>
      )}

      <SubmitButton>Save changes</SubmitButton>
    </form>
  );
}
