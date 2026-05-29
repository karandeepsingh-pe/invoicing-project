"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { AssignmentSlaTier, RateCategory } from "@prisma/client";
import { createAssignment } from "@/lib/actions/assignment";
import { eligibleCategories, type TechnicianFlags } from "@/lib/domain/technician-pools";
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
  backfillAllowed: boolean;
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
  defaultSlaTier,
  accounts,
  flags,
  hasActiveDedication,
  onSuccess,
}: {
  technicianId: string;
  technicianBand: number;
  primaryCategory: RateCategory;
  defaultSlaTier: AssignmentSlaTier;
  accounts: AccountOption[];
  flags: TechnicianFlags;
  hasActiveDedication: boolean;
  onSuccess?: () => void;
}) {
  const [state, action] = useActionState(createAssignment, null);

  useEffect(() => {
    if (state && state.ok) onSuccess?.();
  }, [state, onSuccess]);

  const allowedCategories = eligibleCategories(flags, hasActiveDedication);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [category, setCategory] = useState<RateCategory>(
    allowedCategories.includes(primaryCategory)
      ? primaryCategory
      : (allowedCategories[0] ?? primaryCategory),
  );

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === accountId),
    [accountId, accounts],
  );
  const preview = selectedAccount?.previewByCategory[category] ?? [];

  // Org policy can switch off backfill for the selected account. Keep the SLA
  // tier controlled so picking a no-backfill account drops a stale BACKFILL pick.
  const accountAllowsBackfill = selectedAccount?.backfillAllowed ?? true;
  const [slaTier, setSlaTier] = useState<AssignmentSlaTier>(defaultSlaTier);
  useEffect(() => {
    if (!accountAllowsBackfill && slaTier === AssignmentSlaTier.BACKFILL) {
      setSlaTier(AssignmentSlaTier.NO_BACKFILL);
    }
  }, [accountAllowsBackfill, slaTier]);

  const fieldErrors = state && state.ok === false ? state.fieldErrors : undefined;
  const formError = state && state.ok === false ? state.formError : undefined;

  if (hasActiveDedication) {
    return (
      <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-3 text-sm text-amber-700 dark:text-amber-300">
        This technician has an active <strong>Dedicated FTE</strong> assignment and is locked
        out of new work until it ends. End the dedication first, then assign them elsewhere.
      </div>
    );
  }

  if (allowedCategories.length === 0) {
    return (
      <div className="rounded-md border border-border-strong bg-surface px-3 py-3 text-sm text-fg-muted">
        This technician isn&apos;t in any pool yet. Use <strong>Edit details</strong> to flag
        them as available for Dedicated, Project, or Dispatch, then assign.
      </div>
    );
  }

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
          {allowedCategories.map((c) => (
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

      <SelectField
        label="Band SLA tier"
        name="slaTier"
        value={slaTier}
        onChange={(e) => setSlaTier(e.target.value as AssignmentSlaTier)}
        errors={fieldErrors?.slaTier}
        hint={
          accountAllowsBackfill
            ? "Defaults to the technician's backfill trait. BACKFILL / NO_BACKFILL for DEDICATED; NONE for Dispatch / Project."
            : "Org policy: backfill is off for this account, so the BACKFILL tier is unavailable."
        }
      >
        <option value="NONE">None (Dispatch / Project)</option>
        {accountAllowsBackfill && (
          <option value="BACKFILL">Backfill (replacement guaranteed)</option>
        )}
        <option value="NO_BACKFILL">No Backfill</option>
      </SelectField>

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
