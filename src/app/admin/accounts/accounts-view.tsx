"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { RateBasis } from "@prisma/client";
import { SearchBar } from "@/components/admin/search-bar";
import { ClientAccountEditForm } from "./edit-form";
import { ClientAccountDeleteButton } from "./delete-button";

export type AccountCard = {
  id: string;
  name: string;
  currency: string | null;
  orgId: string;
  orgName: string;
  orgDefaultCurrency: string;
  outputTemplate: string;
  rateCount: number;
  miscCount: number;
  assignmentCount: number;
  invoiceRunCount: number;
  clientPocName: string | null;
  clientSpocEmail: string | null;
  projectDescription: string | null;
  defaultHours: number;
  orgBackfillAllowed: boolean;
  orgRateBasis: RateBasis;
  backfillAllowedOverride: boolean | null;
  rateBasisOverride: RateBasis | null;
};

export function AccountsView({ accounts }: { accounts: AccountCard[] }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!q) return accounts;
    return accounts.filter((a) => {
      return (
        a.name.toLowerCase().includes(q) ||
        a.orgName.toLowerCase().includes(q)
      );
    });
  }, [accounts, q]);

  return (
    <div className="flex flex-col gap-5">
      <SearchBar
        value={query}
        onChange={setQuery}
        placeholder="Search by account or org name…"
        countLabel={`${filtered.length} of ${accounts.length}`}
      />

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((a) => {
          const effectiveCurrency = a.currency ?? a.orgDefaultCurrency;
          const isOverride = a.currency !== null && a.currency !== a.orgDefaultCurrency;
          return (
            <article
              key={a.id}
              className="glass group flex flex-col gap-4 rounded-xl p-5 transition-all hover:-translate-y-0.5"
            >
              <header className="flex items-start justify-between gap-3">
                <Link
                  href={`/admin/accounts/${a.id}` as never}
                  className="flex items-start gap-3"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-sm font-bold tracking-tight text-accent">
                    {initials(a.name)}
                  </div>
                  <div className="flex flex-col leading-tight">
                    <span className="text-base font-semibold tracking-tightish text-fg group-hover:text-accent">
                      {a.name}
                    </span>
                    <span className="mt-0.5 text-xs text-fg-subtle">
                      under{" "}
                      <Link
                        href={`/admin/orgs/${a.orgId}` as never}
                        className="text-fg-muted hover:text-accent"
                      >
                        {a.orgName}
                      </Link>
                    </span>
                  </div>
                </Link>
                <span
                  className={
                    "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider " +
                    (a.outputTemplate === "FSO"
                      ? "bg-accent/10 text-accent"
                      : "bg-surface-2 text-fg-muted")
                  }
                >
                  {a.outputTemplate}
                </span>
              </header>

              <div className="flex items-center gap-2 text-[11px]">
                <span className="rounded bg-surface-2 px-2 py-0.5 font-mono text-fg-muted">
                  {effectiveCurrency}
                </span>
                {isOverride && (
                  <span className="text-fg-subtle">override (org default {a.orgDefaultCurrency})</span>
                )}
              </div>

              <dl className="grid grid-cols-4 gap-2 text-xs">
                <Stat label="Rates" value={a.rateCount} />
                <Stat label="Misc" value={a.miscCount} />
                <Stat label="Assigns" value={a.assignmentCount} />
                <Stat label="Runs" value={a.invoiceRunCount} />
              </dl>

              <ClientAccountEditForm
                id={a.id}
                name={a.name}
                currency={a.currency}
                orgDefaultCurrency={a.orgDefaultCurrency}
                clientPocName={a.clientPocName}
                clientSpocEmail={a.clientSpocEmail}
                projectDescription={a.projectDescription}
                defaultHours={a.defaultHours}
                orgBackfillAllowed={a.orgBackfillAllowed}
                orgRateBasis={a.orgRateBasis}
                backfillAllowedOverride={a.backfillAllowedOverride}
                rateBasisOverride={a.rateBasisOverride}
              />

              <footer className="flex items-center justify-between gap-2 border-t border-border pt-3">
                <Link
                  href={`/admin/accounts/${a.id}` as never}
                  className="text-xs font-medium text-accent hover:text-accent-hover"
                >
                  Manage rates →
                </Link>
                <ClientAccountDeleteButton id={a.id} name={a.name} />
              </footer>
            </article>
          );
        })}

        {filtered.length === 0 && (
          <div className="col-span-full rounded-xl border border-dashed border-border bg-surface p-8 text-center text-sm text-fg-muted">
            {q ? `No accounts match "${query}".` : "No accounts yet."}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-surface-2 px-2 py-1.5">
      <div className="text-[10px] font-medium uppercase tracking-wider text-fg-subtle">{label}</div>
      <div className="text-sm font-semibold tabular-nums text-fg">{value}</div>
    </div>
  );
}

function initials(name: string): string {
  const parts = name.replace(/[^A-Za-z0-9 ]+/g, " ").trim().split(/\s+/);
  if (parts.length === 0 || parts[0] === "") return "—";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
