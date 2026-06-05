"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { RateCategory } from "@prisma/client";
import {
  DeleteAccountButton,
  DeleteOrgButton,
  DeleteTechnicianButton,
} from "./delete-buttons";
import { AddAccountForOrgDialog } from "./add-account-for-org-dialog";
import { AssignTechToAccountDialog } from "./assign-tech-dialog";
import { TechnicianCreateDialog } from "@/app/admin/technicians/create-dialog";
import type { TechOption } from "@/app/admin/accounts/[accountId]/create-assignment-form";
import type { ExistingTech } from "@/app/admin/technicians/create-form";

const categoryLabel: Record<RateCategory, string> = {
  DEDICATED: "Dedicated",
  PROJECT_TM: "Project / T&M",
  DISPATCH_SCHED: "Dispatch",
  SCHEDULED: "Scheduled Visit",
};

const categoryShort: Record<RateCategory, string> = {
  DEDICATED: "Dedicated",
  PROJECT_TM: "Project",
  DISPATCH_SCHED: "Dispatch",
  SCHEDULED: "Scheduled",
};

export type AssignedTech = {
  id: string;
  name: string;
  band: number;
  category: RateCategory;
};

export type AccountRow = {
  id: string;
  name: string;
  currency: string;
  rateCount: number;
  miscCount: number;
  assignmentCount: number;
  invoiceRunCount: number;
  assignedTechs: AssignedTech[];
};

export type TechRow = {
  id: string;
  firstName: string;
  lastName: string;
  employeeId: string | null;
  primaryCategory: RateCategory;
  band: number;
  isRebadged: boolean;
  assignmentCount: number;
  location: string | null;
};

export type OrgRow = {
  id: string;
  name: string;
  outputTemplate: string;
  defaultCurrency: string;
  accounts: AccountRow[];
  technicians: TechRow[];
};

type Tab = "orgs" | "accounts" | "technicians";

function existingTechsFromOrgs(orgs: OrgRow[]): ExistingTech[] {
  return orgs.flatMap((o) =>
    o.technicians.map((t) => ({
      firstName: t.firstName,
      lastName: t.lastName,
      employerOrgId: o.id,
      employerOrgName: o.name,
      employeeId: t.employeeId,
    })),
  );
}

export function ManagementView({
  orgs,
  techOptions,
}: {
  orgs: OrgRow[];
  techOptions: TechOption[];
}) {
  const [tab, setTab] = useState<Tab>("orgs");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const q = query.trim().toLowerCase();
  const isFiltering = q.length > 0;

  // Unfiltered grand totals shown on the tabs.
  const grandTotals = useMemo(
    () => ({
      orgs: orgs.length,
      accounts: orgs.reduce((n, o) => n + o.accounts.length, 0),
      techs: orgs.reduce((n, o) => n + o.technicians.length, 0),
    }),
    [orgs],
  );

  // ── Orgs tab: filtered grouped orgs (existing behaviour) ──
  const filtered = useMemo(() => {
    if (!isFiltering) return orgs;
    return orgs
      .map((o) => {
        const orgMatches = o.name.toLowerCase().includes(q);
        const accounts = o.accounts.filter(
          (a) =>
            a.name.toLowerCase().includes(q) ||
            a.assignedTechs.some((t) => t.name.toLowerCase().includes(q)),
        );
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

  // ── Accounts / Technicians tabs: flat lists across all orgs ──
  const allAccounts = useMemo(
    () => orgs.flatMap((o) => o.accounts.map((a) => ({ ...a, orgId: o.id, orgName: o.name }))),
    [orgs],
  );
  const allTechs = useMemo(
    () => orgs.flatMap((o) => o.technicians.map((t) => ({ ...t, orgId: o.id, orgName: o.name }))),
    [orgs],
  );
  const filteredAccounts = useMemo(() => {
    if (!isFiltering) return allAccounts;
    return allAccounts.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.orgName.toLowerCase().includes(q) ||
        a.assignedTechs.some((t) => t.name.toLowerCase().includes(q)),
    );
  }, [allAccounts, q, isFiltering]);
  const filteredTechs = useMemo(() => {
    if (!isFiltering) return allTechs;
    return allTechs.filter(
      (t) =>
        `${t.firstName} ${t.lastName}`.toLowerCase().includes(q) ||
        (t.employeeId ?? "").toLowerCase().includes(q) ||
        t.orgName.toLowerCase().includes(q),
    );
  }, [allTechs, q, isFiltering]);

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

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "orgs", label: "Orgs", count: grandTotals.orgs },
    { key: "accounts", label: "Accounts", count: grandTotals.accounts },
    { key: "technicians", label: "Technicians", count: grandTotals.techs },
  ];
  const placeholder =
    tab === "accounts"
      ? "Search accounts…"
      : tab === "technicians"
        ? "Search technicians…"
        : "Search orgs, accounts, technicians…";

  return (
    <div className="flex flex-col gap-5">
      <div className="sticky top-0 z-10 -mx-1 flex flex-col gap-3 bg-bg px-1 pb-2 pt-1">
        {/* Tabs (with total counts) */}
        <div className="flex flex-wrap gap-1.5 text-sm">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              aria-pressed={tab === t.key}
              className={
                "inline-flex items-center gap-2 rounded-md px-3 py-1.5 font-medium transition-colors " +
                (tab === t.key
                  ? "bg-accent text-accent-fg"
                  : "border border-border-strong bg-surface text-fg-muted hover:bg-surface-2")
              }
            >
              {t.label}
              <span
                className={
                  "rounded-full px-1.5 py-0.5 text-[11px] tabular-nums " +
                  (tab === t.key ? "bg-accent-fg/20" : "bg-bg")
                }
              >
                {t.count}
              </span>
            </button>
          ))}
        </div>

        {/* Search + active-tab count / expand-collapse */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative flex w-full max-w-md items-center">
            <SearchIcon className="pointer-events-none absolute left-3 h-4 w-4 text-fg-subtle" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={placeholder}
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
            {tab === "orgs" && (
              <>
                <span className="tabular-nums">
                  {totals.orgs} org{totals.orgs === 1 ? "" : "s"} · {totals.accounts} account
                  {totals.accounts === 1 ? "" : "s"} · {totals.techs} tech{totals.techs === 1 ? "" : "s"}
                </span>
                <span className="text-fg-subtle/50">·</span>
                <button type="button" onClick={expandAll} className="font-medium text-fg-muted hover:text-accent">
                  Expand all
                </button>
                <button type="button" onClick={collapseAll} className="font-medium text-fg-muted hover:text-accent">
                  Collapse all
                </button>
              </>
            )}
            {tab === "accounts" && (
              <span className="tabular-nums">
                {filteredAccounts.length} account{filteredAccounts.length === 1 ? "" : "s"}
              </span>
            )}
            {tab === "technicians" && (
              <span className="tabular-nums">
                {filteredTechs.length} technician{filteredTechs.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Orgs tab (grouped) ── */}
      {tab === "orgs" && (
        <>
          {filtered.length === 0 && (
            <div className="glass rounded-lg p-8 text-center text-sm text-fg-muted">
              {isFiltering ? `No matches for "${query}".` : "No orgs yet."}
            </div>
          )}
          <div className="flex flex-col gap-3">
            {filtered.map((o) => {
              const isOpen = isFiltering || expanded.has(o.id);
              return (
                <section key={o.id} className="glass overflow-hidden">
                  <header className="flex items-center justify-between gap-4 border-b border-border bg-surface-2 px-4 py-3">
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
                        addSlot={
                          <AddAccountForOrgDialog
                            orgId={o.id}
                            orgName={o.name}
                            defaultCurrency={o.defaultCurrency}
                          />
                        }
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
                                    <AccountNameCell
                                      id={a.id}
                                      name={a.name}
                                      currency={a.currency}
                                      assignedTechs={a.assignedTechs}
                                      showAssigned={false}
                                    />
                                  </td>
                                  <td className="py-2 text-right tabular-nums">{a.rateCount}</td>
                                  <td className="py-2 text-right tabular-nums">{a.miscCount}</td>
                                  <td className="py-2 text-right tabular-nums">{a.assignmentCount}</td>
                                  <td className="py-2 text-right tabular-nums">{a.invoiceRunCount}</td>
                                  <td className="py-2 pl-2 text-right">
                                    <AccountActions
                                      id={a.id}
                                      name={a.name}
                                      accountLabel={`${o.name} / ${a.name}`}
                                      technicians={techOptions}
                                    />
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

                      <SubSection title="Assigned technicians">
                        {o.accounts.length === 0 ? (
                          <p className="py-3 text-xs text-fg-subtle">No client accounts.</p>
                        ) : (
                          <div className="flex flex-col gap-3">
                            {o.accounts.map((a) => (
                              <div key={a.id}>
                                <Link
                                  href={`/admin/accounts/${a.id}` as never}
                                  className="text-xs font-medium text-fg hover:text-accent"
                                >
                                  {a.name}
                                </Link>
                                {a.assignedTechs.length > 0 ? (
                                  <div className="mt-1 flex flex-wrap gap-1">
                                    {a.assignedTechs.map((t) => (
                                      <Link
                                        key={t.id}
                                        href={`/admin/technicians/${t.id}` as never}
                                        title={`${t.name} · Band ${t.band} · ${categoryLabel[t.category]}`}
                                        className="inline-flex items-center gap-1 rounded-full bg-bg px-2 py-0.5 text-[11px] text-fg-muted hover:text-accent"
                                      >
                                        <span>{t.name}</span>
                                        <span className="text-fg-subtle">· {categoryShort[t.category]}</span>
                                      </Link>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="mt-0.5 text-[11px] text-fg-subtle">
                                    No technicians assigned
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </SubSection>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}

      {/* ── Accounts tab (flat) ── */}
      {tab === "accounts" && (
        <div className="glass overflow-hidden rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-[11px] uppercase tracking-wider text-fg-subtle">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Account</th>
                <th className="px-4 py-2 text-left font-medium">Org</th>
                <th className="px-4 py-2 text-right font-medium">Rates</th>
                <th className="px-4 py-2 text-right font-medium">Misc</th>
                <th className="px-4 py-2 text-right font-medium">Assign.</th>
                <th className="px-4 py-2 text-right font-medium">Runs</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filteredAccounts.map((a) => (
                <tr key={a.id} className="border-t border-border">
                  <td className="px-4 py-2">
                    <AccountNameCell id={a.id} name={a.name} currency={a.currency} assignedTechs={a.assignedTechs} />
                  </td>
                  <td className="px-4 py-2 text-fg-muted">{a.orgName}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{a.rateCount}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{a.miscCount}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{a.assignmentCount}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{a.invoiceRunCount}</td>
                  <td className="px-4 py-2 pl-2 text-right">
                    <AccountActions
                      id={a.id}
                      name={a.name}
                      accountLabel={`${a.orgName} / ${a.name}`}
                      technicians={techOptions}
                    />
                  </td>
                </tr>
              ))}
              {filteredAccounts.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-4 text-sm text-fg-subtle">
                    {isFiltering ? `No accounts match "${query}".` : "No accounts yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Technicians tab (flat) ── */}
      {tab === "technicians" && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-end">
            <TechnicianCreateDialog
              orgs={orgs.map((o) => ({ id: o.id, name: o.name }))}
              existingTechs={existingTechsFromOrgs(orgs)}
            />
          </div>
          <div className="glass overflow-hidden rounded-lg">
            <table className="w-full text-sm">
            <thead className="bg-surface-2 text-[11px] uppercase tracking-wider text-fg-subtle">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Name</th>
                <th className="px-4 py-2 text-left font-medium">Org</th>
                <th className="px-4 py-2 text-left font-medium">Category</th>
                <th className="px-4 py-2 text-left font-medium">Band</th>
                <th className="px-4 py-2 text-right font-medium">Assign.</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filteredTechs.map((t) => (
                <tr key={t.id} className="border-t border-border">
                  <td className="px-4 py-2">
                    <TechNameCell id={t.id} firstName={t.firstName} lastName={t.lastName} location={t.location} />
                  </td>
                  <td className="px-4 py-2 text-fg-muted">{t.orgName}</td>
                  <td className="px-4 py-2 text-fg-muted">{categoryLabel[t.primaryCategory]}</td>
                  <td className="px-4 py-2 text-fg-muted">{t.isRebadged ? "Rebadged" : `Band ${t.band}`}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{t.assignmentCount}</td>
                  <td className="px-4 py-2 pl-2 text-right">
                    <DeleteTechnicianButton id={t.id} firstName={t.firstName} lastName={t.lastName} />
                  </td>
                </tr>
              ))}
              {filteredTechs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-4 text-sm text-fg-subtle">
                    {isFiltering ? `No technicians match "${query}".` : "No technicians yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}

function AccountNameCell({
  id,
  name,
  currency,
  assignedTechs,
  showAssigned = true,
}: {
  id: string;
  name: string;
  currency: string;
  assignedTechs: AssignedTech[];
  showAssigned?: boolean;
}) {
  return (
    <>
      <Link className="font-medium text-fg hover:text-accent" href={`/admin/accounts/${id}` as never}>
        {name}
      </Link>
      <div className="text-[11px] text-fg-subtle">{currency}</div>
      {showAssigned &&
        (assignedTechs.length > 0 ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {assignedTechs.map((t) => (
              <Link
                key={t.id}
                href={`/admin/technicians/${t.id}` as never}
                title={`${t.name} · Band ${t.band} · ${categoryLabel[t.category]}`}
                className="inline-flex items-center gap-1 rounded-full bg-bg px-2 py-0.5 text-[11px] text-fg-muted hover:text-accent"
              >
                <span>{t.name}</span>
                <span className="text-fg-subtle">· {categoryShort[t.category]}</span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="mt-1 text-[11px] text-fg-subtle">No technicians assigned</div>
        ))}
    </>
  );
}

function AccountActions({
  id,
  name,
  accountLabel,
  technicians,
}: {
  id: string;
  name: string;
  accountLabel: string;
  technicians: TechOption[];
}) {
  return (
    <div className="flex items-center justify-end gap-2">
      <AssignTechToAccountDialog
        clientAccountId={id}
        accountLabel={accountLabel}
        technicians={technicians}
      />
      <Link href={`/admin/timesheets/${id}` as never} className="text-[11px] font-medium text-accent hover:text-accent-hover">
        Timesheet
      </Link>
      <Link href={`/admin/invoices/generate/${id}` as never} className="text-[11px] font-medium text-accent hover:text-accent-hover">
        Invoice
      </Link>
      <DeleteAccountButton id={id} name={name} />
    </div>
  );
}

function TechNameCell({
  id,
  firstName,
  lastName,
  location,
}: {
  id: string;
  firstName: string;
  lastName: string;
  location: string | null;
}) {
  return (
    <>
      <Link className="font-medium text-fg hover:text-accent" href={`/admin/technicians/${id}` as never}>
        {firstName} {lastName}
      </Link>
      {location && <div className="text-[11px] text-fg-subtle">{location}</div>}
    </>
  );
}

function SubSection({
  title,
  addSlot,
  children,
}: {
  title: string;
  addSlot?: React.ReactNode;
  empty?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">{title}</h3>
        {addSlot}
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
