"use client";

import { useState, useTransition } from "react";
import { generateProjectInvoice } from "@/lib/actions/generate-project-invoice";
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

export function ProjectGenerateForm({
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
    success: { title: "Project pre-invoice generated" },
    error: { fallbackTitle: "Failed to generate" },
  });

  function handleGenerate() {
    startTransition(async () => {
      const fd = new FormData();
      fd.append("payload", JSON.stringify({ accountId, year, month }));
      const result = await generateProjectInvoice(null, fd);
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
      className="self-start rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-50"
    >
      {pending ? "Generating…" : "Generate Project pre-invoice (.xlsx)"}
    </button>
  );
}
