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
 * Rebadged billing fields for the technician forms. Annual salary is the ONLY
 * billing basis (2026-06-10): billing = annual / 12 / businessDays × daysWorked.
 * Non-rebadged Dedicated techs bill the account band annual, so the per-tech
 * annual input lives INSIDE the Rebadged section only — entering it auto-fills
 * the derived Monthly / Hourly / Day-rate references. When the Rebadged section
 * is hidden, `annualSalary` is not submitted, so existing stored overrides are
 * preserved untouched (Prisma skips undefined fields).
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
  const annual = Number.isFinite(salaryNum) && salaryNum > 0 ? salaryNum : 0;
  const monthly = monthlyFromAnnual(annual);
  const hourly = annual > 0 ? annual / ANNUAL_WORK_HOURS : 0;

  const legacyValues = [
    { label: "Day Rate", value: defaults?.rebadgedDayRate },
    { label: "Monthly Rate", value: defaults?.rebadgedMonthlyRate },
    { label: "Hourly Rate", value: defaults?.rebadgedHourlyRate },
  ].filter((l) => l.value != null && Number(l.value) > 0);

  if (!isDedicated) return null;

  return (
    <div className="flex flex-col gap-3">
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
        <div className="flex flex-col gap-3 rounded-md border border-border-strong bg-surface/40 p-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-fg-muted">
            Annual rate (required for rebadged billing)
            <input
              name="annualSalary"
              type="number"
              step="0.01"
              min="0"
              value={salary}
              onChange={(e) => setSalary(e.target.value)}
              placeholder="e.g. 91344.60"
              className={inputCls}
            />
          </label>

          {/* Derived references — fill themselves from the annual above. */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <DerivedValue label="Monthly (annual ÷ 12)" value={monthly} />
            <DerivedValue label={`Hourly (annual ÷ ${ANNUAL_WORK_HOURS})`} value={hourly} />
            <DerivedValue
              label="Day rate (varies by month)"
              value={monthly > 0 ? monthly / 22 : 0}
              suffix=" @ 22 bd"
            />
          </div>
          <p className="text-xs text-fg-subtle">
            Billing = annual ÷ 12 ÷ business days × days worked — the account rate sheet is
            ignored. A fully-worked month bills exactly the monthly above; a rebadged tech without
            an annual shows as <span className="font-medium text-fg">unpriced</span> on the
            pre-invoice.
          </p>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <RebadgedRate label="OT Rate / hr" name="rebadgedOtRate" value={defaults?.rebadgedOtRate} />
            <RebadgedRate label="Weekend Rate / hr" name="rebadgedWeekendRate" value={defaults?.rebadgedWeekendRate} />
          </div>

          {legacyValues.length > 0 && (
            <div className="rounded-md border border-border bg-surface/60 p-2">
              <p className="text-[11px] font-medium text-fg-subtle">
                Legacy — not billed (kept for reference; the annual above is the basis):
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

function DerivedValue({
  label,
  value,
  suffix = "",
}: {
  label: string;
  value: number;
  suffix?: string;
}) {
  return (
    <div className="flex flex-col gap-1 text-xs font-medium text-fg-muted">
      {label}
      <div className="rounded-md border border-border bg-surface/60 px-3 py-2 text-sm tabular-nums text-fg-subtle">
        {value > 0 ? `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${suffix}` : "—"}
      </div>
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
