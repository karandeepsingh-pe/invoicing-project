"use client";

import { useState } from "react";
import { deriveRebadgedRates } from "@/lib/invoice/rebadged-rates";

export type RebadgedDefaults = {
  isRebadged?: boolean;
  annualSalary?: string | null;
  rebadgedOtRate?: string | null;
  rebadgedWeekendRate?: string | null;
};

const inputCls =
  "rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-subtle outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

/**
 * "Rebadged" toggle + salary-driven fields for the technician forms. When on,
 * reveals Annual Salary (+ manual OT/Weekend hourly rates) and a live derived
 * preview. A rebadged Dedicated tech bills off salary, not the account rate sheet.
 */
export function RebadgedFields({ defaults }: { defaults?: RebadgedDefaults }) {
  const [rebadged, setRebadged] = useState(Boolean(defaults?.isRebadged));
  const [salary, setSalary] = useState(defaults?.annualSalary ?? "");

  const salaryNum = Number(salary);
  const { hourly, dayRate } = deriveRebadgedRates(
    Number.isFinite(salaryNum) ? salaryNum : 0,
    8,
  );

  return (
    <div className="flex flex-col gap-2">
      <label className="inline-flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isRebadged"
          checked={rebadged}
          onChange={(e) => setRebadged(e.target.checked)}
          className="h-4 w-4 rounded border-border-strong text-accent accent-accent focus:ring-accent"
        />
        <span className="font-medium text-fg">Rebadged — bill from annual salary</span>
      </label>

      {rebadged && (
        <div className="flex flex-col gap-2 rounded-md border border-border-strong bg-surface/40 p-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-fg-muted">
              Annual salary
              <input
                name="annualSalary"
                type="number"
                step="0.01"
                min="0"
                value={salary}
                onChange={(e) => setSalary(e.target.value)}
                placeholder="e.g. 104000"
                className={inputCls}
              />
            </label>
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
            Derived: <span className="font-medium text-fg">${hourly.toFixed(2)}/hr</span> ·{" "}
            <span className="font-medium text-fg">${dayRate.toFixed(2)}/day</span>{" "}
            (hourly = salary ÷ 2080; day shown at 8h — billing uses the account&apos;s Default
            Hours). OT &amp; weekend are billed at the manual rates above.
          </p>
        </div>
      )}
    </div>
  );
}
