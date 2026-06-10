"use client";

import { useCallback, useMemo, useState } from "react";
import { setAccountRate } from "@/lib/actions/account-rate";
import { BANDS } from "@/lib/domain/rate-dimensions";
import { monthlyFromAnnual } from "@/lib/invoice/billing-basis";
import { ANNUAL_WORK_HOURS } from "@/lib/invoice/rebadged-rates";

type SubCat = { id: string; code: string; label: string; isOvertimeVariant: boolean };
type Sla = { id: string; code: string; label: string };
type ExistingRate = {
  rateSubCategoryId: string;
  band: number;
  slaId: string;
  rateAmount: string | null;
};

const DEDICATED_TIERS = [
  { code: "NO_BACKFILL", label: "No Backfill" },
  { code: "BACKFILL", label: "Backfill" },
] as const;

// Retired basis rows: shown greyed (read-only, clearable) only where a value
// still exists, so the team can see and retire the conflicting data.
const LEGACY_CODES = new Set(["DAY_RATE", "MONTHLY", "HOURLY", "MONTHLY_DAY_RATE", "ANNUAL_BACKFILL"]);

function cellKey(subcatId: string, band: number, slaId: string): string {
  return `${subcatId}|${band}|${slaId}`;
}

function trimAmount(amount: string | null): string {
  if (amount === null || amount === "") return "";
  const n = Number(amount);
  return Number.isFinite(n) ? String(n) : "";
}

function fmt(n: number): string {
  return n > 0 ? n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";
}

/**
 * Dedicated rate editor — ANNUAL is the only billing basis (2026-06-10):
 * billing = annual ÷ 12 ÷ business days × days worked. The team enters one
 * Annual Salary per band×tier; Monthly and Hourly display as derived read-only
 * references; the day rate varies by month so it is a hint, not a cell. OT and
 * Weekend hourly rates stay editable. Retired Day/Monthly/Hourly values render
 * greyed "legacy — not billed" with a per-cell clear.
 */
export function DedicatedRateSection({
  clientAccountId,
  subCategories,
  slas,
  rates,
}: {
  clientAccountId: string;
  subCategories: SubCat[];
  slas: Sla[];
  rates: ExistingRate[];
}) {
  const [tier, setTier] = useState<"NO_BACKFILL" | "BACKFILL">("NO_BACKFILL");
  const slaByCode = useMemo(() => new Map(slas.map((s) => [s.code, s])), [slas]);
  const subcatByCode = useMemo(
    () => new Map(subCategories.map((s) => [s.code, s])),
    [subCategories],
  );

  const initial = useMemo(() => {
    const m: Record<string, string> = {};
    for (const r of rates) {
      m[cellKey(r.rateSubCategoryId, r.band, r.slaId)] = trimAmount(r.rateAmount);
    }
    return m;
  }, [rates]);

  const [text, setText] = useState<Record<string, string>>(initial);
  const [savedText, setSavedText] = useState<Record<string, string>>(initial);
  const [savingCount, setSavingCount] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);

  const persist = useCallback(
    (subcatId: string, band: number, slaId: string, key: string, value: string) => {
      setSavingCount((n) => n + 1);
      void (async () => {
        const fd = new FormData();
        fd.append("clientAccountId", clientAccountId);
        fd.append("rateSubCategoryId", subcatId);
        fd.append("band", String(band));
        fd.append("slaId", slaId);
        fd.append("rateAmount", value);
        const res = await setAccountRate(null, fd);
        setSavingCount((n) => Math.max(0, n - 1));
        if (res && res.ok) {
          setSaveError(null);
          setSavedText((prev) => ({ ...prev, [key]: value }));
        } else {
          setSaveError(
            res && res.ok === false
              ? res.formError ?? "Save failed — rate not stored"
              : "Save failed — rate not stored",
          );
        }
      })();
    },
    [clientAccountId],
  );

  function handleBlur(subcatId: string, band: number, slaId: string) {
    const key = cellKey(subcatId, band, slaId);
    const raw = (text[key] ?? "").trim();
    if (raw === (savedText[key] ?? "")) return;
    if (raw !== "" && !(Number.isFinite(Number(raw)) && Number(raw) >= 0)) return;
    persist(subcatId, band, slaId, key, raw);
  }

  // All hooks above this line — the missing-SLA early return must come after them.
  const dirtyCount = useMemo(() => {
    let n = 0;
    for (const k of Object.keys(text)) {
      if ((text[k] ?? "") !== (savedText[k] ?? "")) n += 1;
    }
    return n;
  }, [text, savedText]);

  const tierSla = slaByCode.get(tier);
  if (!tierSla) {
    return (
      <div className="px-4 py-3 text-xs text-fg-subtle">
        Rate dimensions are not configured (missing SLA master rows). Run the seed.
      </div>
    );
  }
  const slaId = tierSla.id;

  const annualSub = subcatByCode.get("ANNUAL_RATE");
  const otSub = subcatByCode.get("OT_HOURLY_RATE");
  const weekendSub = subcatByCode.get("WEEKEND_HOURLY_RATE");

  const annualByBand = (band: number): number => {
    if (!annualSub) return 0;
    const v = Number(text[cellKey(annualSub.id, band, slaId)] ?? "");
    return Number.isFinite(v) && v > 0 ? v : 0;
  };

  // Legacy cells that still hold values for the visible tier.
  const legacyCells = subCategories
    .filter((s) => LEGACY_CODES.has(s.code))
    .flatMap((s) =>
      BANDS.map((band) => ({ sub: s, band, key: cellKey(s.id, band, slaId) }))
        .filter(({ key }) => (savedText[key] ?? "") !== ""),
    );

  const status = saveError ? (
    <span className="text-danger">{saveError}</span>
  ) : savingCount > 0 ? (
    <span className="text-fg-muted">Saving…</span>
  ) : dirtyCount > 0 ? (
    <span className="text-fg-muted">{dirtyCount} unsaved</span>
  ) : (
    <span className="text-success">All changes saved</span>
  );

  const editableRow = (sub: SubCat | undefined, label: string, accent = false) =>
    sub && (
      <tr key={sub.id} className="hover:bg-surface/40">
        <td className="sticky left-0 z-10 border-b border-r border-border bg-bg px-3 py-1.5">
          <span className={accent ? "text-accent" : "font-medium text-fg"}>{label}</span>
          <span className="ml-1 text-[10px] text-fg-subtle">{sub.code}</span>
        </td>
        {BANDS.map((band) => {
          const key = cellKey(sub.id, band, slaId);
          const value = text[key] ?? "";
          const unsaved = (value.trim() || "") !== (savedText[key] ?? "");
          return (
            <td key={band} className="border-b border-r border-border">
              <input
                type="text"
                inputMode="decimal"
                value={value}
                onChange={(e) => setText((prev) => ({ ...prev, [key]: e.target.value }))}
                onBlur={() => handleBlur(sub.id, band, slaId)}
                placeholder="—"
                className={
                  "w-24 bg-transparent px-2 py-1 text-right text-xs tabular-nums outline-none focus:bg-surface " +
                  (unsaved ? "text-fg-subtle/70" : "text-fg")
                }
              />
            </td>
          );
        })}
      </tr>
    );

  const derivedRow = (label: string, derive: (annual: number) => number) => (
    <tr className="bg-surface/30">
      <td className="sticky left-0 z-10 border-b border-r border-border bg-surface/30 px-3 py-1.5 text-fg-subtle">
        {label} <span className="text-[10px]">(derived)</span>
      </td>
      {BANDS.map((band) => (
        <td
          key={band}
          className="border-b border-r border-border px-2 py-1 text-right text-xs tabular-nums text-fg-subtle"
        >
          {fmt(derive(annualByBand(band)))}
        </td>
      ))}
    </tr>
  );

  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 text-xs">
          <span className="text-fg-subtle">Tier:</span>
          {DEDICATED_TIERS.map((t) => (
            <button
              key={t.code}
              type="button"
              onClick={() => setTier(t.code)}
              className={
                "rounded-md px-2 py-0.5 font-medium transition-colors " +
                (tier === t.code
                  ? "bg-accent text-accent-fg"
                  : "border border-border-strong bg-surface text-fg-muted hover:bg-surface-2")
              }
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="text-xs font-medium">{status}</div>
      </div>

      <div className="overflow-auto rounded-md border border-border">
        <table className="w-full border-collapse text-xs">
          <thead className="bg-surface-2">
            <tr>
              <th className="sticky left-0 z-10 min-w-[200px] border-b border-r border-border bg-surface-2 px-3 py-2 text-left font-medium">
                Dedicated rate
              </th>
              {BANDS.map((b) => (
                <th key={b} className="border-b border-r border-border px-2 py-2 text-center font-medium">
                  Band {b}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {editableRow(annualSub, "Annual Salary")}
            {derivedRow("Monthly = annual ÷ 12", (a) => monthlyFromAnnual(a))}
            {derivedRow(`Hourly = annual ÷ ${ANNUAL_WORK_HOURS}`, (a) =>
              a > 0 ? a / ANNUAL_WORK_HOURS : 0,
            )}
            <tr className="bg-surface/30">
              <td
                colSpan={BANDS.length + 1}
                className="border-b border-border px-3 py-1.5 text-[11px] text-fg-subtle"
              >
                Day rate varies by month — annual ÷ 12 ÷ business days of the month. Billing = day
                rate × days worked (2h on an 8h day = 0.25 days; PH bills, PTO/AB do not).
              </td>
            </tr>
            {editableRow(otSub, "OT Hourly Rate", true)}
            {editableRow(weekendSub, "Weekend Hourly Rate", true)}
          </tbody>
        </table>
      </div>

      {legacyCells.length > 0 && (
        <div className="rounded-md border border-warning/40 bg-warning-bg/40 p-3 text-xs">
          <p className="font-medium text-warning">
            Legacy Day / Monthly / Hourly values are no longer billed — billing uses Annual only.
          </p>
          <ul className="mt-1 flex flex-col gap-1">
            {legacyCells.map(({ sub, band, key }) => (
              <li key={key} className="flex items-center gap-2 text-fg-subtle">
                <span>
                  {sub.label} · Band {band}: <span className="tabular-nums">{savedText[key]}</span>{" "}
                  <span className="text-[10px]">(legacy — not billed)</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setText((prev) => ({ ...prev, [key]: "" }));
                    persist(sub.id, band, slaId, key, "");
                  }}
                  className="rounded border border-border-strong bg-surface px-1.5 py-0.5 text-[10px] font-medium text-fg-muted hover:bg-surface-2"
                >
                  Clear
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
