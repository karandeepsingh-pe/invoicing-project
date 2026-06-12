"use client";

import { useState, useTransition } from "react";
import { generateCombinedInvoice } from "@/lib/actions/generate-combined-invoice";
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

export function CombinedGenerateForm({
  accountId,
  year,
  month,
  retainerPerSite = null,
  standbyPerSite = null,
}: {
  accountId: string;
  year: number;
  month: number;
  /** Per-site prices from the account; null = fee not offered (input hidden). */
  retainerPerSite?: number | null;
  standbyPerSite?: number | null;
}) {
  const [pending, startTransition] = useTransition();
  const [dedicatedSites, setDedicatedSites] = useState("");
  const [dispatchSites, setDispatchSites] = useState("");
  const [state, setState] = useState<
    { ok: true; filename: string } | { ok: false; formError?: string } | null
  >(null);

  useActionToast(state, {
    success: { title: "Combined pre-invoice generated" },
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
          dedicatedSites: dedicatedSites ? Number(dedicatedSites) : undefined,
          dispatchSites: dispatchSites ? Number(dispatchSites) : undefined,
        }),
      );
      const result = await generateCombinedInvoice(null, fd);
      if (result && result.ok) {
        downloadBase64(result.base64, result.filename);
        setState({ ok: true, filename: result.filename });
      } else {
        setState(result);
      }
    });
  }

  const siteFee = (count: string, perSite: number) => {
    const n = Number(count);
    return n > 0 ? ` = $${(n * perSite).toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "";
  };

  return (
    <div className="flex flex-col gap-3">
      {(retainerPerSite != null || standbyPerSite != null) && (
        <div className="glass-soft flex flex-col gap-3 rounded-md p-3 sm:flex-row sm:items-end">
          {retainerPerSite != null && (
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-fg-muted">
                Dedicated retainer sites
                <span className="ml-1 text-fg-subtle">
                  (× ${retainerPerSite}{siteFee(dedicatedSites, retainerPerSite)})
                </span>
              </span>
              <input
                type="number"
                min={0}
                step={1}
                value={dedicatedSites}
                onChange={(e) => setDedicatedSites(e.target.value)}
                placeholder="0 = skip"
                className="glass-input w-44 rounded-md px-3 py-2 text-sm text-fg"
              />
            </label>
          )}
          {standbyPerSite != null && (
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-fg-muted">
                Dispatch standby sites
                <span className="ml-1 text-fg-subtle">
                  (× ${standbyPerSite}{siteFee(dispatchSites, standbyPerSite)})
                </span>
              </span>
              <input
                type="number"
                min={0}
                step={1}
                value={dispatchSites}
                onChange={(e) => setDispatchSites(e.target.value)}
                placeholder="0 = skip"
                className="glass-input w-44 rounded-md px-3 py-2 text-sm text-fg"
              />
            </label>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={handleGenerate}
        disabled={pending}
        className="self-start rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-50"
      >
        {pending ? "Generating…" : "Generate Combined pre-invoice (.xlsx)"}
      </button>
    </div>
  );
}
