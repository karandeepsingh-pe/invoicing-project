"use client";

import { useState } from "react";
import { Dialog } from "@/components/admin/dialog";
import { STATUS_CODES } from "@/lib/validation/cell";

export type FillRangeArgs = {
  value: string; // a status code (e.g. "AB") or an hours string (e.g. "8")
  fromDate: string; // ISO yyyy-mm-dd
  toDate: string; // ISO yyyy-mm-dd
  weekdaysOnly: boolean;
};

const HOURS = "__HOURS__";

function dayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  const wd = d.toLocaleString("en-US", { weekday: "short", timeZone: "UTC" });
  return `${wd} ${d.getUTCDate()}`;
}

const inputClass = "glass-input rounded-md px-3 py-2 text-sm text-fg";

export function FillRangeDialog({
  technicianName,
  days,
  defaultHours,
  onApply,
}: {
  technicianName: string;
  days: string[];
  defaultHours: number;
  onApply: (args: FillRangeArgs) => void;
}) {
  const first = days[0] ?? "";
  const last = days[days.length - 1] ?? "";
  const [mode, setMode] = useState<string>("AB"); // a status code or HOURS
  const [hours, setHours] = useState<string>(String(defaultHours));
  const [fromDate, setFromDate] = useState<string>(first);
  const [toDate, setToDate] = useState<string>(last);
  const [weekdaysOnly, setWeekdaysOnly] = useState(true);

  const hoursNum = Number(hours.trim());
  const hoursValid =
    /^\d{1,2}(\.\d{1,2})?$/.test(hours.trim()) && hoursNum >= 0 && hoursNum <= 24;
  const valid = mode !== HOURS || hoursValid;
  const value = mode === HOURS ? hours.trim() : mode;

  return (
    <Dialog
      trigger={
        <button
          type="button"
          className="ui-link-accent text-[11px] font-medium"
        >
          Fill range
        </button>
      }
      title={`Fill ${technicianName}'s month`}
      description="Set one value across a range of days, then review and Save month to persist."
      size="sm"
    >
      {({ close }) => (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-fg-muted">Value</span>
            <select value={mode} onChange={(e) => setMode(e.target.value)} className={inputClass}>
              {STATUS_CODES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
              <option value={HOURS}>Hours…</option>
            </select>
          </label>

          {mode === HOURS && (
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-fg-muted">Hours (0–24)</span>
              <input
                type="number"
                min={0}
                max={24}
                step={0.5}
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                className={inputClass}
              />
              {!hoursValid && (
                <span className="text-xs text-danger">Enter hours between 0 and 24.</span>
              )}
            </label>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-fg-muted">From</span>
              <select
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className={inputClass}
              >
                {days.map((d) => (
                  <option key={d} value={d}>
                    {dayLabel(d)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-fg-muted">To</span>
              <select
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className={inputClass}
              >
                {days.map((d) => (
                  <option key={d} value={d}>
                    {dayLabel(d)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm text-fg-muted">
            <input
              type="checkbox"
              checked={weekdaysOnly}
              onChange={(e) => setWeekdaysOnly(e.target.checked)}
              className="h-4 w-4 rounded border-border-strong text-accent accent-accent focus:ring-accent"
            />
            Weekdays only (skip Sat / Sun)
          </label>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={close}
              className="inline-flex items-center rounded-md border border-border-strong bg-surface/60 px-3.5 py-2 text-sm font-medium text-fg-muted transition-colors hover:bg-surface hover:text-fg"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!valid}
              onClick={() => {
                onApply({ value, fromDate, toDate, weekdaysOnly });
                close();
              }}
              className="inline-flex items-center rounded-md bg-accent px-3.5 py-2 text-sm font-medium text-accent-fg shadow-sm transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
