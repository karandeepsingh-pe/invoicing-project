"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RateCategory } from "@prisma/client";
import { softDeleteAccountTypeMonth } from "@/lib/actions/soft-delete";
import { useActionToast } from "@/lib/hooks/use-action-toast";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import type { ActionResult } from "@/lib/actions/result";

export function DeleteMonthButton({
  accountId,
  rateCategories,
  year,
  month,
  label,
}: {
  accountId: string;
  rateCategories: RateCategory[];
  year: number;
  month: number;
  label: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<ActionResult>(null);
  const [pending, startTransition] = useTransition();

  useActionToast(state, {
    success: { title: "Month deleted" },
    error: { fallbackTitle: "Delete failed" },
  });

  return (
    <ConfirmDialog
      trigger={
        <button
          type="button"
          disabled={pending}
          className="rounded-md border border-danger/40 bg-surface px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger-bg disabled:opacity-50"
        >
          {pending ? "Deleting…" : "Delete entire month"}
        </button>
      }
      title={`Delete ALL ${label} entries for this month?`}
      body={
        <span>
          Soft-deletes every technician&apos;s entries for this account and month
          (recoverable). Other months are unaffected. Use this to reset a month
          during testing.
        </span>
      }
      destructive
      confirmLabel="Delete month"
      onConfirm={() =>
        startTransition(async () => {
          let last: ActionResult = null;
          for (const rateCategory of rateCategories) {
            const fd = new FormData();
            fd.append("accountId", accountId);
            fd.append("rateCategory", rateCategory);
            fd.append("year", String(year));
            fd.append("month", String(month));
            last = await softDeleteAccountTypeMonth(null, fd);
            if (last && last.ok === false) break;
          }
          setState(last);
          if (last?.ok) router.refresh();
        })
      }
    />
  );
}
