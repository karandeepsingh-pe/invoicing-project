"use client";

import { useState } from "react";
import { RateCategory } from "@prisma/client";
import { monthlyFromAnnual } from "@/lib/invoice/billing-basis";
import { ANNUAL_WORK_HOURS } from "@/lib/invoice/rebadged-rates";

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
 * Dedicated FTE rate fields for the technician forms. Annual salary is the ONLY
 * billing basis (2026-06-10): billing = annual / 12 / businessDays × daysWorked,
 * so a fully-worked month bills exactly annual / 12 and a 21-day + 2-hour month
 * bills 21.25 × the derived day rate.
 *  - "Annual rate override" (annualSalary): optional per-tech salary; blank = the
 *    account's band annual. REQUIRED in practice for rebadged techs (they bypass
 *    the band sheet entirely).
 *  - "Rebadged" toggle: bill entirely off this technician's own annual + own
 *    OT/weekend hourly rates; the account rate sheet is ignored.
 *  - Legacy rebadged Day/Monthly/Hourly values display greyed, read-only ("not
 *    billed"); they are not submitted, so saving the form preserves them in the
 *    DB without ever billing from them.
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
  const annual = Number.isFinite(salaryNum) ? salaryNum : 0;
  const monthly = monthlyFromAnnual(annual);
  const hourly = annual > 0 ? annual / ANNUAL_WORK_HOURS : 0;

  const legacyValues = [
    { label: "Day Rate", value: defaults?.rebadgedDayRate },
    { label: "Monthly Rate", value: defaults?.rebadgedMonthlyRate },
    { label: "Hourly Rate", value: defaults?.rebadgedHourlyRate },
  ].filter((l) => l.value != null && Number(l.value) > 0);

  return (
    <div className="flex flex-col gap-3">
      {isDedicated && (
        <div className="flex flex-col gap-2 rounded-md border border-border-strong bg-surface/40 p-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-fg-muted">
            Annual rate override (optional; required for rebadged)
            <input
              name="annualSalary"
              type="number"
              step="0.01"
              min="0"
              value={salary}
              onChange={(e) => setSalary(e.target.value)}
              placeholder="e.g. 66000"
              className={inputCls}
            />
          </label>
          <p className="text-xs text-fg-subtle">
            Leave blank to use the account&apos;s band annual. Billing = annual ÷ 12 ÷ business days
            × days worked. Monthly = <span className="font-medium text-fg">${monthly.toFixed(2)}</span>
            {" · "}hourly ≈ <span className="font-medium text-fg">${hourly.toFixed(2)}</span>
            {" · "}day rate varies by month (e.g. ${monthly > 0 ? (monthly / 22).toFixed(2) : "0.00"} at
            22 business days). A fully-worked month bills exactly annual ÷ 12.
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
          <p className="text-xs text-fg-subtle">
            The day-rate basis is the <span className="font-medium text-fg">Annual rate above</span>{" "}
            (annual ÷ 12 ÷ business days — the account rate sheet is ignored). Only OT and Weekend
            hourly rates are entered here. A rebadged tech without an annual shows as{" "}
            <span className="font-medium text-fg">unpriced</span> on the pre-invoice.
          </p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <RebadgedRate label="OT Rate / hr" name="rebadgedOtRate" value={defaults?.rebadgedOtRate} />
            <RebadgedRate label="Weekend Rate / hr" name="rebadgedWeekendRate" value={defaults?.rebadgedWeekendRate} />
          </div>
          {legacyValues.length > 0 && (
            <div className="rounded-md border border-border bg-surface/60 p-2">
              <p className="text-[11px] font-medium text-fg-subtle">
                Legacy — not billed (kept for reference; annual above is the basis):
              </p>
              <p className="text-[11px] text-fg-subtle">
                {legacyValues.map((l) => `${l.label}: ${l.value}`).join(" · ")}
              </p>
            </div>
          )}
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
