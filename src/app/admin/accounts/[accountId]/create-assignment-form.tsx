"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { AssignmentSlaTier, RateCategory } from "@prisma/client";
import { createAssignments } from "@/lib/actions/assignment";
import { flagForCategory, type TechnicianFlags } from "@/lib/domain/technician-pools";
import { FormError, SelectField, TextField } from "@/components/admin/field";
import { FilterInput } from "@/components/admin/filter-input";
import { filterByText } from "@/lib/display/option-filter";
import { useActionToast } from "@/lib/hooks/use-action-toast";
import {
  buildTechDisplayMap,
  formatTechDisplay,
  type LabelableTech,
} from "@/lib/display/technician-label";

const categoryLabel: Record<RateCategory, string> = {
  DEDICATED: "Dedicated",
  PROJECT_TM: "Project / T&M",
  DISPATCH_SCHED: "Dispatch",
  SCHEDULED: "Scheduled Visit",
};

function tierLabel(tier: AssignmentSlaTier): string {
  if (tier === "BACKFILL") return "Backfill";
  if (tier === "NO_BACKFILL") return "No Backfill";
  return "No tier set";
}

export type TechOption = LabelableTech & {
  band: number;
  primaryCategory: RateCategory;
  // Backfill trait, set on the technician. A Dedicated assignment inherits it.
  defaultSlaTier: AssignmentSlaTier;
  flags: TechnicianFlags;
  /** Non-null when the tech has an active DEDICATED assignment (locks them out). */
  dedicatedToAccountId: string | null;
};

export function AccountAssignmentCreateForm({
  clientAccountId,
  accountLabel,
  technicians,
  onSuccess,
}: {
  clientAccountId: string;
  accountLabel: string;
  technicians: TechOption[];
  onSuccess?: () => void;
}) {
  const [state, action] = useActionState(createAssignments, null);
  const today = new Date().toISOString().slice(0, 10);

  const displayMap = useMemo(() => buildTechDisplayMap(technicians), [technicians]);

  // Category drives the eligible pool: only techs flagged for the chosen category
  // AND not currently dedicated anywhere can take a new assignment here.
  const [category, setCategory] = useState<RateCategory>(RateCategory.DEDICATED);
  const eligibleTechs = useMemo(
    () =>
      technicians.filter(
        (t) => t.dedicatedToAccountId === null && flagForCategory(t.flags, category),
      ),
    [technicians, category],
  );

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [techQuery, setTechQuery] = useState("");
  const visibleTechs = useMemo(
    () =>
      filterByText(eligibleTechs, techQuery, (t) =>
        formatTechDisplay(displayMap.get(t.id), `${t.firstName} ${t.lastName}`),
      ),
    [eligibleTechs, techQuery, displayMap],
  );
  // Drop any selected techs no longer eligible after a category change.
  useEffect(() => {
    setSelectedIds((prev) => {
      const eligible = new Set(eligibleTechs.map((t) => t.id));
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (eligible.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [eligibleTechs]);

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  useActionToast(state, {
    success: { title: "Assignments created" },
    error: { fallbackTitle: "Failed to create assignments" },
  });

  useEffect(() => {
    if (state && state.ok) onSuccess?.();
  }, [state, onSuccess]);

  const fieldErrors = state && state.ok === false ? state.fieldErrors : undefined;
  const formError = state && state.ok === false ? state.formError : undefined;

  if (technicians.length === 0) {
    return (
      <p className="text-sm text-fg-muted">
        No technicians exist yet. Create one from the Technicians tab, then come back to assign.
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="clientAccountId" value={clientAccountId} />
      <FormError error={formError} />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <SelectField
          label="Category"
          name="rateCategory"
          required
          value={category}
          onChange={(e) => setCategory(e.target.value as RateCategory)}
          errors={fieldErrors?.rateCategory}
          hint="Filters the technician list to this pool"
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
          defaultValue={today}
          errors={fieldErrors?.startDate}
        />
        <TextField
          label="End date"
          name="endDate"
          type="date"
          required={category !== RateCategory.DEDICATED}
          errors={fieldErrors?.endDate}
          hint={
            category === RateCategory.DEDICATED
              ? "Open-ended if blank (ongoing FTE)"
              : "Required — this engagement only shows in its active months"
          }
        />
      </div>

      {category === RateCategory.DEDICATED && (
        <p className="-mt-1 text-xs text-fg-subtle">
          Each technician is billed at the backfill tier set on their own record (shown
          below). Set it on the technician if it reads &quot;No tier set&quot;.
        </p>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-medium text-fg-muted">
            Technicians · {categoryLabel[category]} · {selectedIds.size} selected
            {techQuery.trim() !== "" && ` · ${visibleTechs.length} of ${eligibleTechs.length} shown`}
          </span>
          {eligibleTechs.length > 0 && (
            <div className="flex items-center gap-3 text-xs">
              <button
                type="button"
                onClick={() =>
                  setSelectedIds(
                    (prev) => new Set([...prev, ...visibleTechs.map((t) => t.id)]),
                  )
                }
                className="font-medium text-accent hover:text-accent-hover"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="font-medium text-fg-subtle hover:text-fg"
              >
                Clear
              </button>
            </div>
          )}
        </div>
        {eligibleTechs.length === 0 ? (
          <p className="rounded-md border border-border bg-surface px-3 py-3 text-sm text-fg-subtle">
            No technicians flagged for {categoryLabel[category]} (or all are dedicated elsewhere).
          </p>
        ) : (
          <>
            <FilterInput
              value={techQuery}
              onChange={setTechQuery}
              placeholder="Search technicians…"
            />
            <div className="max-h-56 overflow-y-auto rounded-md border border-border-strong bg-surface">
              {visibleTechs.length === 0 && (
                <p className="px-3 py-3 text-sm text-fg-subtle">
                  No technicians match &ldquo;{techQuery}&rdquo; — clear the search to see all.
                </p>
              )}
              {visibleTechs.map((t) => (
              <label
                key={t.id}
                className="flex cursor-pointer items-center gap-3 border-b border-border/60 px-3 py-2 text-sm last:border-b-0 hover:bg-surface-2"
              >
                <input
                  type="checkbox"
                  name="technicianIds"
                  value={t.id}
                  checked={selectedIds.has(t.id)}
                  onChange={() => toggle(t.id)}
                  className="h-4 w-4 rounded border-border-strong text-accent accent-accent focus:ring-accent"
                />
                <span className="font-medium text-fg">
                  {formatTechDisplay(displayMap.get(t.id), `${t.firstName} ${t.lastName}`)}
                </span>
                <span className="ml-auto flex items-center gap-2 text-xs text-fg-subtle">
                  {category === RateCategory.DEDICATED && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        t.defaultSlaTier === "NONE"
                          ? "bg-danger-bg text-danger"
                          : "bg-surface-2 text-fg-muted"
                      }`}
                    >
                      {tierLabel(t.defaultSlaTier)}
                    </span>
                  )}
                  <span>Band {t.band}</span>
                </span>
              </label>
              ))}
            </div>
          </>
        )}
        <div className="text-xs text-fg-subtle">
          Account: <span className="font-medium text-fg">{accountLabel}</span>
        </div>
      </div>

      <button
        type="submit"
        disabled={selectedIds.size === 0}
        className="inline-flex items-center self-start rounded-md bg-accent px-3.5 py-2 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-50"
      >
        Create assignment{selectedIds.size === 1 ? "" : "s"}
      </button>
    </form>
  );
}
