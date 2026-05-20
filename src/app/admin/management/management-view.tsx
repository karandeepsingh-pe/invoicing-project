"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { RateCategory } from "@prisma/client";
import {
  DeleteAccountButton,
  DeleteOrgButton,
  DeleteTechnicianButton,
} from "./delete-buttons";

const categoryLabel: Record<RateCategory, string> = {
  DEDICATED: "Dedicated",
  PROJECT_TM: "Project / T&M",
  DISPATCH_SCHED: "Dispatch + Scheduled Visit",
};

export type AccountRow = {
  id: string;
  name: string;
  currency: string;
  rateCount: number;
  miscCount: number;
  assignmentCount: number;
  invoiceRunCount: number;
};

export type TechRow = {
  id: string;
  firstName: string;
  lastName: string;
  primaryCategory: RateCategory;
  band: number;
  assignmentCount: number;
};

export type OrgRow = {
  id: string;
  name: string;
  outputTemplate: string;
  defaultCurrency: string;
  accounts: AccountRow[];
  technicians: TechRow[];
};

export function ManagementView({ orgs }: { orgs: OrgRow[] }) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const q = query.trim().toLowerCase();
  const isFiltering = q.length > 0;

  const filtered = useMemo(() => {
    if (!isFiltering) return orgs;
    return orgs
      .map((o) => {
        const orgMatches = o.name.toLowerCase().includes(q);
        const accounts = o.accounts.filter((a) => a.name.toLowerCase().includes(q));
        const technicians = o.technicians.filter(
          (t) => `${t.firstName} ${t.lastName}`.toLowerCase().includes(q),
        );
        if (!orgMatches && accounts.length === 0 && technicians.length === 0) {
          return null;
        }
        return orgMatches ? o : { ...o, accounts, technicians };
      })
      .filter((o): o is OrgRow => o !== null);
  }, [orgs, q, isFiltering]);

  const totals = useMemo(
    () => ({
      orgs: filtered.length,
      accounts: filtered.reduce((n, o) => n + o.accounts.length, 0),
      techs: filtered.reduce((n, o) => n + o.technicians.length, 0),
    }),
    [filtered],
  );

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function expandAll() {
    setExpanded(new Set(filtered.map((o) => o.id)));
  }

  function collapseAll() {
    setExpanded(new Set());
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="sticky top-0 z-10 -mx-1 flex flex-col gap-3 bg-bg/80 px-1 pb-2 pt-1 backdrop-blur md:flex-row md:items-center md:justify-between">
        <div className="relative flex w-full max-w-md items-center">
          <SearchIcon className="pointer-events-none absolute left-3 h-4 w-4 text-fg-subtle" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search orgs, accounts, technicians…"
            className="w-full rounded-md border border-border-strong bg-surface py-2 pl-9 pr-9 text-sm text-fg placeholder:text-fg-subtle outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20"
            aria-label="Search"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-2 rounded p-1 text-fg-subtle hover:bg-surface-2 hover:text-fg"
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-fg-subtle">
          <span className="tabular-nums">
            {totals.orgs} org{totals.orgs === 1 ? "" : "s"} · {totals.accounts} account
            {totals.accounts === 1 ? "" : "s"} · {totals.techs} tech{totals.techs === 1 ? "" : "s"}
          </span>
          <span className="text-fg-subtle/50">·</span>
          <button
            type="button"
            onClick={expandAll}
            className="font-medium text-fg-muted hover:text-accent"
          >
            Expand all
          </button>
          <button
            type="button"
            onClick={collapseAll}
            className="font-medium text-fg-muted hover:text-accent"
          >
            Collapse all
          </button>
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="glass rounded-lg p-8 text-center text-sm text-fg-muted">
          {isFiltering ? `No matches for "${query}".` : "No orgs yet."}
        </div>
      )}

      <div className="flex flex-col gap-3">
        {filtered.map((o) => {
          const isOpen = isFiltering || expanded.has(o.id);
          return (
            <section
              key={o.id}
              className="glass overflow-hidden"
            >
              <header
                className="flex items-center justify-between gap-4 border-b border-border bg-surface-2 px-4 py-3"
              >
                <button
                  type="button"
                  onClick={() => toggle(o.id)}
                  disabled={isFiltering}
                  className="group flex flex-1 items-center gap-3 text-left disabled:cursor-default"
                  aria-expanded={isOpen}
                >
                  <ChevronIcon
                    className={`h-4 w-4 text-fg-subtle transition-transform duration-200 ${
                      isOpen ? "rotate-90" : "rotate-0"
                    } ${isFiltering ? "opacity-40" : "group-hover:text-fg"}`}
                  />
                  <span className="text-base font-semibold tracking-tightish text-fg group-hover:text-accent">
                    {o.name}
                  </span>
                  <span className="hidden text-xs text-fg-subtle sm:inline">
                    {o.outputTemplate} · {o.defaultCurrency}
                  </span>
                  <span className="ml-auto inline-flex items-center gap-2 text-xs text-fg-subtle">
                    <span className="rounded-full bg-bg px-2 py-0.5 tabular-nums">
                      {o.accounts.length} account{o.accounts.length === 1 ? "" : "s"}
                    </span>
                    <span className="rounded-full bg-bg px-2 py-0.5 tabular-nums">
                      {o.technicians.length} tech{o.technicians.length === 1 ? "" : "s"}
                    </span>
                  </span>
                </button>
                <DeleteOrgButton id={o.id} name={o.name} />
              </header>

              {isOpen && (
                <div className="grid grid-cols-1 gap-0 lg:grid-cols-2 lg:divide-x lg:divide-border">
                  <SubSection
                    title="Client accounts"
                    addLabel="+ Add account"
                    addHref={`/admin/orgs/${o.id}`}
                    empty="No client accounts."
                  >
                    {o.accounts.length > 0 && (
                      <table className="w-full text-sm">
                        <thead className="text-[11px] uppercase tracking-wider text-fg-subtle">
                          <tr className="border-b border-border">
                            <th className="py-1.5 text-left font-medium">Name</th>
                            <th className="py-1.5 text-right font-medium">Rates</th>
                            <th className="py-1.5 text-right font-medium">Misc</th>
                            <th className="py-1.5 text-right font-medium">Assign.</th>
                            <th className="py-1.5 text-right font-medium">Runs</th>
                            <th className="py-1.5"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {o.accounts.map((a) => (
                            <tr key={a.id} className="border-b border-border last:border-b-0">
                              <td className="py-2">
                                <Link
                                  className="font-medium text-fg hover:text-accent"
                                  href={`/admin/accounts/${a.id}` as never}
                                >
                                  {a.name}
                                </Link>
                                <div className="text-[11px] text-fg-subtle">{a.currency}</div>
                              </td>
                              <td className="py-2 text-right tabular-nums">{a.rateCount}</td>
                              <td className="py-2 text-right tabular-nums">{a.miscCount}</td>
                              <td className="py-2 text-right tabular-nums">{a.assignmentCount}</td>
                              <td className="py-2 text-right tabular-nums">{a.invoiceRunCount}</td>
                              <td className="py-2 pl-2 text-right">
                                <DeleteAccountButton id={a.id} name={a.name} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    {o.accounts.length === 0 && (
                      <p className="py-3 text-xs text-fg-subtle">No client accounts.</p>
                    )}
                  </SubSection>

                  <SubSection
                    title="Technicians employed"
                    addLabel="+ Add technician"
                    addHref="/admin/technicians"
                    empty="No technicians employed by this org."
                  >
                    {o.technicians.length > 0 && (
                      <table className="w-full text-sm">
                        <thead className="text-[11px] uppercase tracking-wider text-fg-subtle">
                          <tr className="border-b border-border">
                            <th className="py-1.5 text-left font-medium">Name</th>
                            <th className="py-1.5 text-left font-medium">Category</th>
                            <th className="py-1.5 text-left font-medium">Band</th>
                            <th className="py-1.5 text-right font-medium">Assign.</th>
                            <th className="py-1.5"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {o.technicians.map((t) => (
                            <tr key={t.id} className="border-b border-border last:border-b-0">
                              <td className="py-2">
                                <Link
                                  className="font-medium text-fg hover:text-accent"
                                  href={`/admin/technicians/${t.id}` as never}
                                >
                                  {t.firstName} {t.lastName}
                                </Link>
                              </td>
                              <td className="py-2 text-fg-muted">
                                {categoryLabel[t.primaryCategory]}
                              </td>
                              <td className="py-2 text-fg-muted">Band {t.band}</td>
                              <td className="py-2 text-right tabular-nums">{t.assignmentCount}</td>
                              <td className="py-2 pl-2 text-right">
                                <DeleteTechnicianButton
                                  id={t.id}
                                  firstName={t.firstName}
                                  lastName={t.lastName}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    {o.technicians.length === 0 && (
                      <p className="py-3 text-xs text-fg-subtle">No technicians employed.</p>
                    )}
                  </SubSection>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function SubSection({
  title,
  addLabel,
  addHref,
  children,
}: {
  title: string;
  addLabel: string;
  addHref: string;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <div className="p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">{title}</h3>
        <Link
          href={addHref as never}
          className="text-xs font-medium text-accent hover:text-accent-hover"
        >
          {addLabel}
        </Link>
      </div>
      {children}
    </div>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
      <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
      <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
    </svg>
  );
}
