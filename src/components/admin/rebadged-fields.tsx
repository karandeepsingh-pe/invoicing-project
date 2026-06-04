"use client";

import { useState } from "react";
import { RateCategory } from "@prisma/client";
import { monthlyFromAnnual } from "@/lib/invoice/billing-basis";

export type RebadgedDefaults = {
  isRebadged?: boolean;
  annualSalary?: string | null;
  rebadgedHourlyRate?: string | null;
  rebadgedDayRate?: string | null;
  rebadgedMonthlyRate?: string | null;
  rebadgedOtRate?: string | null;
  rebadgedWeekendRate?: string | null;
};

const inputCls =
  "rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-subtle outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

/**
 * Dedicated FTE rate fields for the technician forms:
 *  - "Annual rate override" (annualSalary), an OPTIONAL per-tech salary. Blank =
 *    use the account's band salary. Set it only for a tech who differs from their
 *    band. Billing spreads the annual across the month's business days (annual /
 *    12 / businessDays), so a fully worked month bills exactly annual / 12.
 *  - A "Rebadged" toggle that ONLY swaps the OT/weekend source to custom per-tech
 *    hourly rates (the day rate always uses the override above, else the band salary).
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
            Annual rate override (optional)
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
            Leave blank to use this account&apos;s band salary. Set only for a tech who differs from
            their band. When set, it is billed as the monthly salary spread over the month&apos;s
            business days. Monthly = annual ÷ 12 ={" "}
            <span className="font-medium text-fg">${monthly.toFixed(2)}</span>; day rate ≈{" "}
            <span className="font-medium text-fg">${(monthly / 22).toFixed(2)}</span> at 22 business
            days (varies by month). A fully-worked month bills exactly annual ÷ 12.
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
        <span className="font-medium text-fg">Rebadged — bill off this technician&apos;s own rates</span>
      </label>

      {rebadged && (
        <div className="flex flex-col gap-2 rounded-md border border-border-strong bg-surface/40 p-3">
          <p className="text-xs font-medium text-fg">Rebadged rates (per technician)</p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <RebadgedRate label="Hourly Rate" name="rebadgedHourlyRate" value={defaults?.rebadgedHourlyRate} />
            <RebadgedRate label="Day Rate" name="rebadgedDayRate" value={defaults?.rebadgedDayRate} />
            <RebadgedRate label="Monthly Rate" name="rebadgedMonthlyRate" value={defaults?.rebadgedMonthlyRate} />
            <RebadgedRate label="OT Rate / hr" name="rebadgedOtRate" value={defaults?.rebadgedOtRate} />
            <RebadgedRate label="Weekend Rate / hr" name="rebadgedWeekendRate" value={defaults?.rebadgedWeekendRate} />
          </div>
          <p className="text-xs text-fg-subtle">
            All optional. The billed day rate prefers the most specific set:{" "}
            <span className="font-medium text-fg">Day → Monthly ÷ business days → Annual (above) ÷ 12 ÷ business days → Hourly × Default Hours</span>.
            OT / Weekend are per-hour. Use the Annual field above for the salary basis.
          </p>
        </div>
      )}
    </div>
  );
}

function RebadgedRate({
  label,
  name,
  value,
}: {
  label: string;
  name: string;
  value?: string | null;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-fg-muted">
      {label}
      <input
        name={name}
        type="number"
        step="0.0001"
        min="0"
        defaultValue={value ?? ""}
        placeholder="optional"
        className={inputCls}
      />
    </label>
  );
}
