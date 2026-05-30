"use client";

import { useState } from "react";
import { RateCategory } from "@prisma/client";
import { monthlyFromAnnual } from "@/lib/invoice/billing-basis";

export type RebadgedDefaults = {
  isRebadged?: boolean;
  annualSalary?: string | null;
  rebadgedOtRate?: string | null;
  rebadgedWeekendRate?: string | null;
};

const inputCls =
  "rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-subtle outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

/**
 * Dedicated FTE rate fields for the technician forms:
 *  - "Annual rate" (annualSalary), shown for every Dedicated tech. Billing spreads
 *    it across the month's business days (annual / 12 / businessDays), so a fully
 *    worked month bills exactly annual / 12.
 *  - A "Rebadged" toggle that ONLY swaps the OT/weekend source to custom per-tech
 *    hourly rates (the day rate always uses the Annual rate above).
 */
export function RebadgedFields({
  primaryCategory,
  defaults,
}: {
  primaryCategory: RateCategory;
  defaults?: RebadgedDefaults;
}) {
  const [rebadged, setRebadged] = useState(Boolean(defaults?.isRebadged));
  const [salary, setSalary] = useState(defaults?.annualSalary ?? "");

  const isDedicated = primaryCategory === RateCategory.DEDICATED;
  const salaryNum = Number(salary);
  const monthly = monthlyFromAnnual(Number.isFinite(salaryNum) ? salaryNum : 0);

  return (
    <div className="flex flex-col gap-3">
      {isDedicated && (
        <div className="flex flex-col gap-2 rounded-md border border-border-strong bg-surface/40 p-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-fg-muted">
            Annual rate
            <input
              name="annualSalary"
              type="number"
              step="0.01"
              min="0"
              value={salary}
              onChange={(e) => setSalary(e.target.value)}
              placeholder="e.g. 74100"
              className={inputCls}
            />
          </label>
          <p className="text-xs text-fg-subtle">
            Billed as the monthly salary spread over the month&apos;s business days. Monthly =
            annual ÷ 12 = <span className="font-medium text-fg">${monthly.toFixed(2)}</span>; day
            rate ≈ <span className="font-medium text-fg">${(monthly / 22).toFixed(2)}</span> at 22
            business days (varies by month). A fully-worked month bills exactly annual ÷ 12. Leave
            blank to fall back to the account band rate.
          </p>
        </div>
      )}

      <label className="inline-flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isRebadged"
          checked={rebadged}
          onChange={(e) => setRebadged(e.target.checked)}
          className="h-4 w-4 rounded border-border-strong text-accent accent-accent focus:ring-accent"
        />
        <span className="font-medium text-fg">Rebadged — bill OT / weekend at custom rates</span>
      </label>

      {rebadged && (
        <div className="flex flex-col gap-2 rounded-md border border-border-strong bg-surface/40 p-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs font-medium text-fg-muted">
              OT rate / hr (manual)
              <input
                name="rebadgedOtRate"
                type="number"
                step="0.0001"
                min="0"
                defaultValue={defaults?.rebadgedOtRate ?? ""}
                placeholder="optional"
                className={inputCls}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-fg-muted">
              Weekend rate / hr (manual)
              <input
                name="rebadgedWeekendRate"
                type="number"
                step="0.0001"
                min="0"
                defaultValue={defaults?.rebadgedWeekendRate ?? ""}
                placeholder="optional"
                className={inputCls}
              />
            </label>
          </div>
          <p className="text-xs text-fg-subtle">
            Overrides the band OT / weekend hourly rates for this technician. The day rate still
            uses the Annual rate above.
          </p>
        </div>
      )}
    </div>
  );
}
