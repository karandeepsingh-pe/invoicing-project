"use client";

import { useState, useTransition } from "react";
import { generateDispatchInvoice } from "@/lib/actions/generate-dispatch-invoice";
import { useActionToast } from "@/lib/hooks/use-action-toast";

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

export function DispatchGenerateForm({
  accountId,
  year,
  month,
  standbyPerSite = null,
}: {
  accountId: string;
  year: number;
  month: number;
  /** Per-site standby price from the account; null = fee not offered. */
  standbyPerSite?: number | null;
}) {
  const [pending, startTransition] = useTransition();
  const [dispatchSites, setDispatchSites] = useState("");
  const [state, setState] = useState<
    { ok: true; filename: string } | { ok: false; formError?: string } | null
  >(null);

  useActionToast(state, {
    success: { title: "Dispatch pre-invoice generated" },
    error: { fallbackTitle: "Failed to generate" },
  });

  function handleGenerate() {
    startTransition(async () => {
      const fd = new FormData();
      fd.append(
        "payload",
        JSON.stringify({
          accountId,
          year,
          month,
          dispatchSites: dispatchSites ? Number(dispatchSites) : undefined,
        }),
      );
      const result = await generateDispatchInvoice(null, fd);
      if (result && result.ok) {
        downloadBase64(result.base64, result.filename);
        setState({ ok: true, filename: result.filename });
      } else {
        setState(result);
      }
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      {standbyPerSite != null && (
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-fg-muted">
            Standby sites
            <span className="ml-1 text-fg-subtle">
              (× ${standbyPerSite}
              {Number(dispatchSites) > 0
                ? ` = $${(Number(dispatchSites) * standbyPerSite).toLocaleString("en-US", { minimumFractionDigits: 2 })}`
                : ""}
              )
            </span>
          </span>
          <input
            type="number"
            min={0}
            step={1}
            value={dispatchSites}
            onChange={(e) => setDispatchSites(e.target.value)}
            placeholder="0 = skip"
            className="glass-input w-40 rounded-md px-3 py-2 text-sm text-fg"
          />
        </label>
      )}
      <button
        type="button"
        onClick={handleGenerate}
        disabled={pending}
        className="self-start rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-50"
      >
        {pending ? "Generating…" : "Generate Dispatch pre-invoice (.xlsx)"}
      </button>
    </div>
  );
}
