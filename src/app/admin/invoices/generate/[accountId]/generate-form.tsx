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

export function GenerateForm({
  accountId,
  year,
  month,
  businessDays,
  assignments,
}: {
  accountId: string;
  year: number;
  month: number;
  businessDays: number;
  assignments: AssignmentPreview[];
}) {
  const [pending, startTransition] = useTransition();
  const [actionState, setActionState] = useState<
    | { ok: true; filename: string }
    | { ok: false; formError?: string }
    | null
  >(null);

  useActionToast(actionState, {
    success: { title: "Pre-invoice generated" },
    error: { fallbackTitle: "Failed to generate pre-invoice" },
  });

  function handleGenerate() {
    const payload = { accountId, year, month };
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
      <p className="text-xs text-fg-subtle">
        Days, OT, and Weekend totals below are derived from the timesheet
        cells. Days = regular hours / DefaultHours. OT = weekday hours above
        DefaultHours. Weekend = numeric Sat/Sun cells.
      </p>
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
                <td className="px-3 py-2 text-right tabular-nums">{businessDays}</td>
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
