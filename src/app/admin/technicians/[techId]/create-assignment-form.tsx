"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { RateCategory } from "@prisma/client";
import { createAssignment } from "@/lib/actions/assignment";
import { FormError, SelectField, SubmitButton, TextField } from "@/components/admin/field";

type PreviewRow = {
  subCategoryLabel: string;
  sla: string;
  rateAmount: string | null;
};

export type AccountOption = {
  id: string;
  label: string;
  currency: string;
  previewByCategory: Record<keyof typeof RateCategory, PreviewRow[]>;
};

const categoryLabel: Record<RateCategory, string> = {
  DEDICATED: "Dedicated",
  PROJECT_TM: "Project / T&M",
  DISPATCH_SCHED: "Dispatch + Scheduled Visit",
};

export function AssignmentCreateForm({
  technicianId,
  technicianBand,
  primaryCategory,
  accounts,
  onSuccess,
}: {
  technicianId: string;
  technicianBand: number;
  primaryCategory: RateCategory;
  accounts: AccountOption[];
  onSuccess?: () => void;
}) {
  const [state, action] = useActionState(createAssignment, null);

  useEffect(() => {
    if (state && state.ok) onSuccess?.();
  }, [state, onSuccess]);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [category, setCategory] = useState<RateCategory>(primaryCategory);

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === accountId),
    [accountId, accounts],
  );
  const preview = selectedAccount?.previewByCategory[category] ?? [];

  const fieldErrors = state && state.ok === false ? state.fieldErrors : undefined;
  const formError = state && state.ok === false ? state.formError : undefined;

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="technicianId" value={technicianId} />
      <FormError error={formError} />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <SelectField
          label="Client account"
          name="clientAccountId"
          required
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          errors={fieldErrors?.clientAccountId}
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Category"
          name="rateCategory"
          required
          value={category}
          onChange={(e) => setCategory(e.target.value as RateCategory)}
          errors={fieldErrors?.rateCategory}
          hint={`Default: ${categoryLabel[primaryCategory]}`}
        >
          {Object.values(RateCategory).map((c) => (
            <option key={c} value={c}>
              {categoryLabel[c]}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Start date"
          name="startDate"
          type="date"
          required
          errors={fieldErrors?.startDate}
        />
        <TextField
          label="End date"
          name="endDate"
          type="date"
          errors={fieldErrors?.endDate}
          hint="Open-ended if blank (typical for DEDICATED)"
        />
      </div>

      <div className="glass-soft rounded-md p-3 text-sm">
        <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
          Inherited rates for {selectedAccount?.label} · {categoryLabel[category]} · Band {technicianBand}
        </div>
        {preview.length === 0 ? (
          <div className="text-danger">
            No active rate rows for this combination — the assignment will be blocked. Add at least one rate
            row on the account for {categoryLabel[category]} at Band {technicianBand} first.
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="text-fg-subtle">
              <tr>
                <th className="py-1 text-left">Sub-category</th>
                <th className="py-1 text-left">SLA</th>
                <th className="py-1 text-right">Rate</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((p, i) => (
                <tr key={`${p.subCategoryLabel}-${p.sla}-${i}`}>
                  <td className="py-1">{p.subCategoryLabel}</td>
                  <td className="py-1 text-fg-muted">{p.sla}</td>
                  <td className="py-1 text-right tabular-nums">
                    {p.rateAmount === null
                      ? "—"
                      : `${selectedAccount!.currency} ${Number(p.rateAmount).toFixed(4).replace(/\.?0+$/, "")}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <SubmitButton>Create assignment</SubmitButton>
      {state && state.ok && <div className="text-sm text-success">Assignment created.</div>}
    </form>
  );
}
