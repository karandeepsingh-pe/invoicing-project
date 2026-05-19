"use client";

import { useActionState, useMemo, useState } from "react";
import { TechType } from "@prisma/client";
import { createAssignment } from "@/lib/actions/assignment";
import { FormError, SelectField, SubmitButton, TextField } from "@/components/admin/field";

type RatePreview = { rateUnit: string; rateAmount: string; otRate: string | null };

export type AccountOption = {
  id: string;
  label: string;
  currency: string;
  activeByTechType: Record<keyof typeof TechType, RatePreview[]>;
};

export function AssignmentCreateForm({
  technicianId,
  primaryType,
  accounts,
}: {
  technicianId: string;
  primaryType: TechType;
  accounts: AccountOption[];
}) {
  const [state, action] = useActionState(createAssignment, null);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [techType, setTechType] = useState<TechType>(primaryType);

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === accountId),
    [accountId, accounts],
  );
  const preview = selectedAccount?.activeByTechType[techType] ?? [];

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
          label="Tech type"
          name="techType"
          required
          value={techType}
          onChange={(e) => setTechType(e.target.value as TechType)}
          errors={fieldErrors?.techType}
          hint={`Default: ${primaryType}`}
        >
          {Object.values(TechType).map((t) => (
            <option key={t} value={t}>
              {t}
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
          hint="Leave blank for open-ended (required for FTE)"
        />
      </div>

      <div className="rounded border border-neutral-200 p-3 text-sm dark:border-neutral-800">
        <div className="mb-1 text-xs uppercase tracking-wide text-neutral-500">
          Inherited rates ({selectedAccount?.label}, {techType})
        </div>
        {preview.length === 0 ? (
          <div className="text-red-700">
            No active rate cards for this combination — assignment will be blocked. Add a rate card on the account first.
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-1 md:grid-cols-2">
            {preview.map((p) => (
              <li key={p.rateUnit} className="text-neutral-700 dark:text-neutral-300">
                <span className="font-mono text-xs">{p.rateUnit}</span> · {selectedAccount!.currency}{" "}
                {Number(p.rateAmount).toFixed(2)}
                {p.otRate && (
                  <span className="text-neutral-500"> (OT {Number(p.otRate).toFixed(2)})</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <SubmitButton>Create assignment</SubmitButton>
      {state && state.ok && <div className="text-sm text-green-700">Assignment created.</div>}
    </form>
  );
}
