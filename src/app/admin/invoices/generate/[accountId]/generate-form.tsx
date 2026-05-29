"use client";

import { useState, useTransition } from "react";
import { generatePreInvoice } from "@/lib/actions/generate-pre-invoice";
import { useActionToast } from "@/lib/hooks/use-action-toast";

export type AssignmentPreview = {
  assignmentId: string;
  technicianName: string;
  band: number;
  backfillLabel: string;
  daysWorked: number;
  otHours: number;
  weekendHours: number;
};

function downloadBase64(base64: string, filename: string) {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type UnpricedAssignment = {
  assignmentId: string;
  technicianName: string;
  band: number;
  backfillLabel: string;
  daysWorked: number;
};

export function GenerateForm({
  accountId,
  year,
  month,
  businessDays,
  assignments,
  unpriced,
}: {
  accountId: string;
  year: number;
  month: number;
  businessDays: number;
  assignments: AssignmentPreview[];
  unpriced: UnpricedAssignment[];
}) {
  const [pending, startTransition] = useTransition();
  const [businessDaysInput, setBusinessDaysInput] = useState<string>(String(businessDays));
  const [actionState, setActionState] = useState<
    | { ok: true; filename: string }
    | { ok: false; formError?: string }
    | null
  >(null);

  useActionToast(actionState, {
    success: { title: "Pre-invoice generated" },
    error: { fallbackTitle: "Failed to generate pre-invoice" },
  });

  // Effective business days: the edited value when valid (1..31), else the
  // computed default. Drives annual-rate proration in the engine.
  const parsedBd = Math.round(Number(businessDaysInput));
  const effectiveBusinessDays =
    Number.isFinite(parsedBd) && parsedBd >= 1 && parsedBd <= 31 ? parsedBd : businessDays;

  function handleGenerate() {
    const payload = { accountId, year, month, businessDays: effectiveBusinessDays };
    startTransition(async () => {
      const fd = new FormData();
      fd.append("payload", JSON.stringify(payload));
      const result = await generatePreInvoice(null, fd);
      if (result && result.ok) {
        downloadBase64(result.base64, result.filename);
        setActionState({ ok: true, filename: result.filename });
      } else {
        setActionState(result);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {unpriced.length > 0 && (
        <div className="rounded-md border border-warning/40 bg-warning-bg/40 px-3 py-2 text-xs text-warning">
          <div className="font-semibold">
            {unpriced.length} technician{unpriced.length === 1 ? "" : "s"} have worked days
            but no matching rate card — they are excluded from the invoice. Add the
            missing rate rows on the account, then regenerate.
          </div>
          <ul className="mt-1 list-disc pl-5">
            {unpriced.map((u) => (
              <li key={u.assignmentId}>
                {u.technicianName} (Band {u.band}
                {u.backfillLabel ? `, ${u.backfillLabel}` : ""}) ·{" "}
                {u.daysWorked.toFixed(2)} day{u.daysWorked === 1 ? "" : "s"} worked
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs text-fg-subtle">
        Days, OT, and Weekend totals below are derived from the timesheet
        cells. Days = regular hours / DefaultHours. OT = weekday hours above
        DefaultHours. Weekend = numeric Sat/Sun cells.
      </p>

      <label className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-fg-muted">Business days this month</span>
        <input
          type="number"
          min={1}
          max={31}
          value={businessDaysInput}
          onChange={(e) => setBusinessDaysInput(e.target.value)}
          className="glass-input w-20 rounded-md px-2 py-1 tabular-nums"
        />
        <span className="text-xs text-fg-subtle">
          Default {businessDays} (weekdays minus PH). Used to prorate annual-rate
          FTEs: Extended = (Annual / 12) x (Days Worked / Business Days).
        </span>
      </label>
      <div className="glass overflow-x-auto rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-xs uppercase tracking-wider text-fg-subtle">
            <tr>
              <th className="px-3 py-2 text-left">Technician</th>
              <th className="px-3 py-2 text-left">Band / SLA</th>
              <th className="px-3 py-2 text-right">Business Days</th>
              <th className="px-3 py-2 text-right">Days Worked</th>
              <th className="px-3 py-2 text-right">OT Hours</th>
              <th className="px-3 py-2 text-right">Weekend Hours</th>
            </tr>
          </thead>
          <tbody>
            {assignments.map((a) => (
              <tr key={a.assignmentId} className="border-t border-border">
                <td className="px-3 py-2 font-medium text-fg">{a.technicianName}</td>
                <td className="px-3 py-2 text-fg-muted">
                  Band {a.band} · {a.backfillLabel}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{effectiveBusinessDays}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {a.daysWorked.toFixed(2)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {a.otHours.toFixed(2)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {a.weekendHours.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={handleGenerate}
        disabled={pending}
        className="self-start rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-50"
      >
        {pending ? "Generating…" : "Generate pre-invoice (.xlsx)"}
      </button>
    </div>
  );
}
