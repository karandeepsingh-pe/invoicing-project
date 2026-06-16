"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/admin/dialog";
import {
  bulkUploadDispatchVisits,
  downloadDispatchVisitTemplate,
  type BulkDispatchUploadResult,
} from "@/lib/actions/bulk-dispatch-upload";

function downloadBase64(base64: string, filename: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
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

export function DispatchBulkUploadDialog({
  accountId,
  year,
  month,
}: {
  accountId: string;
  year: number;
  month: number;
}) {
  const monthLabel = new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return (
    <Dialog
      trigger={
        <span className="inline-flex cursor-pointer items-center rounded-md border border-border-strong bg-surface px-2.5 py-1 text-xs font-medium text-fg transition-colors hover:bg-surface-2">
          Bulk upload visits (.xlsx)
        </span>
      }
      title={`Bulk upload dispatch visits — ${monthLabel}`}
      description={`Uploads only for ${monthLabel}: rows dated outside it are skipped, and re-uploading replaces ${monthLabel}'s dispatch visits for this account. Charges are computed from this account's rate sheet — the sheet carries inputs only.`}
      size="lg"
    >
      {({ close }) => (
        <BulkUploadForm accountId={accountId} year={year} month={month} onClose={close} />
      )}
    </Dialog>
  );
}

function BulkUploadForm({
  accountId,
  year,
  month,
  onClose,
}: {
  accountId: string;
  year: number;
  month: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [templatePending, startTemplate] = useTransition();
  const [result, setResult] = useState<BulkDispatchUploadResult>(null);

  function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setResult({ ok: false, formError: "Choose an .xlsx file first." });
      return;
    }
    const fd = new FormData();
    fd.append("accountId", accountId);
    fd.append("year", String(year));
    fd.append("month", String(month));
    fd.append("file", file);
    startTransition(async () => {
      const res = await bulkUploadDispatchVisits(null, fd);
      setResult(res);
      if (res && res.ok) router.refresh();
    });
  }

  function handleTemplate() {
    startTemplate(async () => {
      const res = await downloadDispatchVisitTemplate(accountId);
      if (res.ok) downloadBase64(res.base64, res.filename);
      else setResult({ ok: false, formError: res.formError });
    });
  }

  return (
    <form onSubmit={handleUpload} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border/60 bg-surface-2 px-3 py-2.5">
        <p className="text-xs text-fg-muted">
          The template&apos;s Reference sheet lists this account&apos;s technicians, SLA codes,
          and visit types. Re-uploading the same sheet skips rows already imported.
        </p>
        <button
          type="button"
          onClick={handleTemplate}
          disabled={templatePending}
          className="shrink-0 rounded-md border border-border-strong bg-surface px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-60"
        >
          {templatePending ? "Preparing…" : "Download template"}
        </button>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-fg-muted">Spreadsheet (.xlsx)</span>
        <input
          ref={fileRef}
          type="file"
          name="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          required
          className="rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg file:mr-3 file:rounded file:border-0 file:bg-accent file:px-3 file:py-1 file:text-sm file:font-medium file:text-accent-fg"
        />
      </label>

      {result && result.ok === false && (
        <div className="rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">
          {result.formError}
        </div>
      )}

      {result && result.ok && (
        <div className="flex flex-col gap-2">
          <div className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-fg">
            Created <strong>{result.created}</strong> visit{result.created === 1 ? "" : "s"}
            {result.skipped > 0 && <> · {result.skipped} skipped (already imported)</>}
            {result.skippedOffMonth > 0 && <> · {result.skippedOffMonth} off-month skipped</>}.
          </div>
          {result.errors.length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
              <p className="mb-1 font-semibold">
                {result.errors.length} row{result.errors.length === 1 ? "" : "s"} need attention:
              </p>
              <ul className="list-disc space-y-0.5 pl-5">
                {result.errors.map((e, i) => (
                  <li key={`${e.row}-${i}`}>
                    Row {e.row}: {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-3 py-2 text-sm font-medium text-fg-subtle transition-colors hover:text-fg"
        >
          {result && result.ok ? "Done" : "Cancel"}
        </button>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-md bg-accent px-3.5 py-2 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending && (
            <span aria-hidden className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent-fg/30 border-t-accent-fg" />
          )}
          {pending ? "Uploading…" : "Upload visits"}
        </button>
      </div>
    </form>
  );
}
