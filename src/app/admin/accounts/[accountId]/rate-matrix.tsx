"use client";

import { useCallback, useMemo, useState } from "react";
import { RateCategory } from "@prisma/client";
import { setAccountRate } from "@/lib/actions/account-rate";
import { BANDS, DISPATCH_BAND, dispatchSlaCodes } from "@/lib/domain/rate-dimensions";
import { DedicatedRateSection } from "./dedicated-rate-section";

type SubCat = { id: string; code: string; label: string; isOvertimeVariant: boolean };
type Sla = { id: string; code: string; label: string };
type ExistingRate = {
  rateSubCategoryId: string;
  band: number;
  slaId: string;
  rateAmount: string | null;
};

type Column = { key: string; label: string; band: number; slaId: string };

function trimAmount(amount: string | null): string {
  if (amount === null || amount === "") return "";
  const n = Number(amount);
  return Number.isFinite(n) ? String(n) : "";
}

function cellKey(subcatId: string, band: number, slaId: string): string {
  return `${subcatId}|${band}|${slaId}`;
}

// Legacy dispatch uplift multipliers, superseded by the explicit OOB / Weekend
// scenario rows. Hidden from the matrix grid (still editable under "Advanced").
const HIDDEN_DISPATCH_CODES = new Set(["OOBH_MULTIPLIER", "WEEKEND_PH_MULTIPLIER"]);

/**
 * Per-account rate matrix with per-cell autosave. Shape per category:
 *  - Dispatch: rows = subcategories, columns = on-site response SLAs, Band fixed 2.
 *  - Dedicated: a Backfill / No-Backfill / Rebadged tier toggle; rows = the matching
 *    subcategories, columns = Band 0..4 (slaId = the selected tier; Rebadged = NA).
 *  - Project / Scheduled: rows = subcategories, columns = Band 0..4 (slaId = NA).
 * A blank cell stores null (no rate yet). Saves go through setAccountRate (upsert).
 */
export function RateMatrix({
  clientAccountId,
  category,
  subCategories,
  slas,
  rates,
}: {
  clientAccountId: string;
  category: RateCategory;
  subCategories: SubCat[];
  slas: Sla[];
  rates: ExistingRate[];
}) {
  // Dedicated has its own annual-only editor (one editable basis + derived
  // monthly/hourly references + greyed legacy rows). Other categories keep the
  // generic sub-category × band/SLA grid below.
  if (category === RateCategory.DEDICATED) {
    return (
      <DedicatedRateSection
        clientAccountId={clientAccountId}
        subCategories={subCategories}
        slas={slas}
        rates={rates}
      />
    );
  }
  return (
    <GenericRateMatrix
      clientAccountId={clientAccountId}
      category={category}
      subCategories={subCategories}
      slas={slas}
      rates={rates}
    />
  );
}

function GenericRateMatrix({
  clientAccountId,
  category,
  subCategories,
  slas,
  rates,
}: {
  clientAccountId: string;
  category: RateCategory;
  subCategories: SubCat[];
  slas: Sla[];
  rates: ExistingRate[];
}) {
  const slaByCode = useMemo(() => new Map(slas.map((s) => [s.code, s])), [slas]);

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

  const isDispatch = category === RateCategory.DISPATCH_SCHED;

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
    // Only persist a valid non-negative number or a blank (clear).
    if (raw !== "" && !(Number.isFinite(Number(raw)) && Number(raw) >= 0)) return;
    persist(subcatId, band, slaId, key, raw);
  }

  // Resolve the columns + visible rows for this category (memoised so the dirty
  // count's deps stay stable across renders).
  const { columns, rows } = useMemo<{ columns: Column[]; rows: SubCat[] }>(() => {
    if (isDispatch) {
      const cols = dispatchSlaCodes
        .map((code) => slaByCode.get(code))
        .filter((s): s is Sla => Boolean(s))
        .map((s) => ({ key: s.id, label: s.code, band: DISPATCH_BAND, slaId: s.id }));
      // Hide the legacy uplift multipliers; the explicit OOB / Weekend scenario
      // rows supersede them. They stay in the data + the Advanced add-row editor.
      const rows = subCategories.filter((s) => !HIDDEN_DISPATCH_CODES.has(s.code));
      return { columns: cols, rows };
    }
    const naSla = slaByCode.get("NA");
    const cols = naSla
      ? BANDS.map((b) => ({ key: `b${b}`, label: `Band ${b}`, band: b, slaId: naSla.id }))
      : [];
    return { columns: cols, rows: subCategories };
  }, [isDispatch, slaByCode, subCategories]);

  const dirtyCount = useMemo(() => {
    let n = 0;
    for (const r of rows) {
      for (const c of columns) {
        const key = cellKey(r.id, c.band, c.slaId);
        if ((text[key] ?? "") !== (savedText[key] ?? "")) n += 1;
      }
    }
    return n;
  }, [rows, columns, text, savedText]);

  if (columns.length === 0) {
    return (
      <div className="px-4 py-3 text-xs text-fg-subtle">
        Rate dimensions are not configured (missing SLA master rows). Run the seed.
      </div>
    );
  }

  const status = saveError ? (
    <span className="text-danger">{saveError}</span>
  ) : savingCount > 0 ? (
    <span className="text-fg-muted">Saving…</span>
  ) : dirtyCount > 0 ? (
    <span className="text-fg-muted">{dirtyCount} unsaved</span>
  ) : (
    <span className="text-success">All changes saved</span>
  );

  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {isDispatch && (
            <span className="text-xs text-fg-subtle">
              Flat per SLA (stored at Band {DISPATCH_BAND}) · enter rates as you go, autosaves
            </span>
          )}
          {!isDispatch && (
            <span className="text-xs text-fg-subtle">Per band · autosaves</span>
          )}
        </div>
        <div className="text-xs font-medium">{status}</div>
      </div>

      <div className="overflow-auto rounded-md border border-border">
        <table className="w-full border-collapse text-xs">
          <thead className="bg-surface-2">
            <tr>
              <th className="sticky left-0 z-10 min-w-[150px] sm:min-w-[200px] border-b border-r border-border bg-surface-2 px-3 py-2 text-left font-medium">
                Sub-category
              </th>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className="border-b border-r border-border px-2 py-2 text-center font-medium"
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((sub) => (
              <tr key={sub.id} className="hover:bg-surface/40">
                <td className="sticky left-0 z-10 border-b border-r border-border bg-bg px-3 py-1.5">
                  <span className={sub.isOvertimeVariant ? "text-accent" : "text-fg"}>
                    {sub.label}
                  </span>
                  <span className="ml-1 text-[10px] text-fg-subtle">{sub.code}</span>
                </td>
                {columns.map((c) => {
                  const key = cellKey(sub.id, c.band, c.slaId);
                  const value = text[key] ?? "";
                  const unsaved = (value.trim() || "") !== (savedText[key] ?? "");
                  return (
                    <td key={c.key} className="border-b border-r border-border">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={value}
                        onChange={(e) =>
                          setText((prev) => ({ ...prev, [key]: e.target.value }))
                        }
                        onBlur={() => handleBlur(sub.id, c.band, c.slaId)}
                        placeholder="—"
                        className={
                          "w-20 bg-transparent px-2 py-1 text-right text-xs tabular-nums outline-none focus:bg-surface " +
                          (unsaved ? "text-fg-subtle/70" : "text-fg")
                        }
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + 1} className="px-3 py-3 text-fg-subtle">
                  No sub-categories for this selection.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
