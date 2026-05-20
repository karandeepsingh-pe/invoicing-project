"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { RateCategory } from "@prisma/client";
import { SearchBar } from "@/components/admin/search-bar";

const categoryLabel: Record<RateCategory, string> = {
  DEDICATED: "Dedicated",
  PROJECT_TM: "Project / T&M",
  DISPATCH_SCHED: "Dispatch + Scheduled Visit",
};

export type RateRow = {
  id: string;
  subCategoryLabel: string;
  sla: string;
  rateAmount: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
};

export type RateGroup = {
  accountId: string;
  orgName: string;
  accountName: string;
  category: RateCategory;
  currency: string;
  rows: RateRow[];
  kind: "active" | "potential";
};

export type TechCard = {
  id: string;
  firstName: string;
  lastName: string;
  primaryCategory: RateCategory;
  band: number;
  employerOrgName: string;
  active: boolean;
  totalAssignments: number;
  activeAssignmentCount: number;
  rateGroups: RateGroup[];
};

export function TechniciansGrid({ techs }: { techs: TechCard[] }) {
  const [query, setQuery] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const q = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    return techs.filter((t) => {
      if (!includeInactive && !t.active) return false;
      if (!q) return true;
      const haystack = [
        `${t.firstName} ${t.lastName}`,
        t.employerOrgName,
        categoryLabel[t.primaryCategory],
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [techs, q, includeInactive]);

  return (
    <div className="flex flex-col gap-5">
      <SearchBar
        value={query}
        onChange={setQuery}
        placeholder="Search technicians by name, employer, or category…"
        countLabel={`${filtered.length} of ${techs.length}`}
        rightSlot={
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-border-strong text-accent accent-accent focus:ring-accent"
            />
            <span className="text-fg-muted">Include inactive</span>
          </label>
        }
      />

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-2">
        {filtered.map((t) => (
          <TechCardView key={t.id} tech={t} />
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full rounded-xl border border-dashed border-border bg-surface p-8 text-center text-sm text-fg-muted">
            {q ? `No technicians match "${query}".` : "No technicians."}
          </div>
        )}
      </section>
    </div>
  );
}

function TechCardView({ tech }: { tech: TechCard }) {
  const totalRateRows = tech.rateGroups.reduce((n, g) => n + g.rows.length, 0);

  return (
    <article className="glass group flex flex-col gap-4 rounded-xl p-5 transition-all hover:-translate-y-0.5">
      <header className="flex items-start justify-between gap-3">
        <Link href={`/admin/technicians/${tech.id}` as never} className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-sm font-bold tracking-tight text-accent">
            {initials(tech.firstName, tech.lastName)}
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-base font-semibold tracking-tightish text-fg group-hover:text-accent">
              {tech.firstName} {tech.lastName}
              {!tech.active && (
                <span className="ml-2 align-middle text-[10px] font-medium uppercase tracking-wider text-fg-subtle">
                  Inactive
                </span>
              )}
            </span>
            <span className="mt-0.5 text-xs text-fg-subtle">{tech.employerOrgName}</span>
          </div>
        </Link>
        <div className="flex flex-col items-end gap-1">
          <span className="inline-flex items-center rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
            {categoryLabel[tech.primaryCategory]}
          </span>
          <span className="inline-flex items-center rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium tracking-wider text-fg-muted">
            Band {tech.band}
          </span>
        </div>
      </header>

      <dl className="grid grid-cols-3 gap-2 text-xs">
        <Stat label="Active assign." value={tech.activeAssignmentCount} />
        <Stat label="Total assign." value={tech.totalAssignments} />
        <Stat label="Rate rows" value={totalRateRows} />
      </dl>

      <div className="flex flex-col gap-2 border-t border-border pt-3">
        <div className="flex items-baseline justify-between">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">
            {tech.activeAssignmentCount > 0 ? "Effective rate sheet" : "Potential rates"}
          </h3>
          <span className="text-[10px] text-fg-subtle">
            {tech.activeAssignmentCount > 0
              ? `at Band ${tech.band}, today`
              : `Primary ${categoryLabel[tech.primaryCategory]} · Band ${tech.band}`}
          </span>
        </div>

        {tech.rateGroups.length === 0 && (
          <p className="text-xs text-fg-subtle">
            No active assignments, and no account has matching rate rows for{" "}
            {categoryLabel[tech.primaryCategory]} at Band {tech.band}.
          </p>
        )}

        {tech.rateGroups.map((g) => (
          <div
            key={g.accountId + "-" + g.category + "-" + g.kind}
            className="glass-soft overflow-hidden rounded-md"
          >
            <header className="flex items-baseline justify-between gap-2 border-b border-border bg-surface-2 px-3 py-2">
              <Link
                href={`/admin/accounts/${g.accountId}` as never}
                className="truncate text-xs font-semibold tracking-tightish text-fg hover:text-accent"
                title={`${g.orgName} / ${g.accountName}`}
              >
                {g.orgName} / {g.accountName}
              </Link>
              <span className="flex shrink-0 items-center gap-1.5 text-[10px] uppercase tracking-wider text-fg-subtle">
                {g.kind === "potential" && (
                  <span className="rounded-full bg-accent/10 px-1.5 py-0.5 text-[9px] font-semibold tracking-wider text-accent">
                    Preview
                  </span>
                )}
                <span>{categoryLabel[g.category]} · {g.currency}</span>
              </span>
            </header>
            {g.rows.length === 0 ? (
              <p className="px-3 py-2 text-[11px] text-fg-subtle">
                No active rate rows. Add some on this account.
              </p>
            ) : (
              <table className="w-full text-[11px]">
                <thead className="text-[10px] uppercase tracking-wider text-fg-subtle">
                  <tr>
                    <th className="px-3 py-1.5 text-left font-medium">Sub-category</th>
                    <th className="px-3 py-1.5 text-left font-medium">SLA</th>
                    <th className="px-3 py-1.5 text-right font-medium">Rate</th>
                    <th className="px-3 py-1.5 text-left font-medium">From</th>
                    <th className="px-3 py-1.5 text-left font-medium">To</th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((r) => (
                    <tr
                      key={r.id}
                      className="border-t border-border/70 last:border-b-0"
                    >
                      <td className="px-3 py-1.5 text-fg-muted">{r.subCategoryLabel}</td>
                      <td className="px-3 py-1.5 text-fg-muted">{r.sla}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-fg">
                        {r.rateAmount === null
                          ? "—"
                          : `${g.currency} ${Number(r.rateAmount).toFixed(4).replace(/\.?0+$/, "")}`}
                      </td>
                      <td className="px-3 py-1.5 text-fg-subtle">{r.effectiveFrom}</td>
                      <td className="px-3 py-1.5 text-fg-subtle">{r.effectiveTo ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
      </div>

      <footer className="flex items-center justify-between gap-2 border-t border-border pt-3">
        <Link
          href={`/admin/technicians/${tech.id}` as never}
          className="text-xs font-medium text-accent hover:text-accent-hover"
        >
          Open profile →
        </Link>
      </footer>
    </article>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-surface-2 px-3 py-2">
      <div className="text-[10px] font-medium uppercase tracking-wider text-fg-subtle">{label}</div>
      <div className="mt-0.5 text-base font-semibold tabular-nums text-fg">{value}</div>
    </div>
  );
}

function initials(first: string, last: string): string {
  const a = first.trim()[0] ?? "";
  const b = last.trim()[0] ?? "";
  return (a + b || "?").toUpperCase();
}
