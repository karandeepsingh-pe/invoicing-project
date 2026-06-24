"use client";

import { useState, useTransition } from "react";
import { generateFsoInvoice } from "@/lib/actions/generate-fso-invoice";
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

/** HCL-only FSO workbook download. Rendered only when the org's outputTemplate is FSO. */
export function FsoGenerateForm({
  accountId,
  year,
  month,
}: {
  accountId: string;
  year: number;
  month: number;
}) {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<
    { ok: true; filename: string } | { ok: false; formError?: string } | null
  >(null);

  useActionToast(state, {
    success: { title: "FSO workbook generated" },
    error: { fallbackTitle: "Failed to generate FSO" },
  });

  function handleGenerate() {
    startTransition(async () => {
      const fd = new FormData();
      fd.append("payload", JSON.stringify({ accountId, year, month }));
      const result = await generateFsoInvoice(null, fd);
      if (result && result.ok) {
        downloadBase64(result.base64, result.filename);
        setState({ ok: true, filename: result.filename });
      } else {
        setState(result);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleGenerate}
      disabled={pending}
      className="self-start rounded-md border border-accent bg-surface px-4 py-2 text-sm font-medium text-accent hover:bg-accent/10 disabled:opacity-50"
    >
      {pending ? "Generating…" : "Generate FSO (HCL) (.xlsx)"}
    </button>
  );
}
