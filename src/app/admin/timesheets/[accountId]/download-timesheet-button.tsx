"use client";

import { useState, useTransition } from "react";
import { exportTimesheetXlsx } from "@/lib/actions/export-timesheet";
import { downloadBase64Xlsx } from "@/lib/download-base64";

export function DownloadTimesheetButton({
  accountId,
  year,
  month,
}: {
  accountId: string;
  year: number;
  month: number;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    startTransition(async () => {
      const result = await exportTimesheetXlsx({ accountId, year, month });
      if (result.ok) {
        setError(null);
        downloadBase64Xlsx(result.base64, result.filename);
      } else {
        setError(result.formError);
      }
    });
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="rounded-md border border-border-strong bg-surface px-3 py-1.5 text-sm font-medium text-fg hover:bg-surface-2 disabled:opacity-50"
      >
        {pending ? "Preparing…" : "Download Excel"}
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  );
}
