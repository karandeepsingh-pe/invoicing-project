"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { SearchBar } from "@/components/admin/search-bar";

export type CommercialAccount = {
  id: string;
  name: string;
  currency: string;
  rateCount: number;
  miscCount: number;
  assignmentCount: number;
};

export type CommercialOrg = {
  id: string;
  name: string;
  outputTemplate: string;
  defaultCurrency: string;
  accounts: CommercialAccount[];
};

export function CommercialsView({ orgs }: { orgs: CommercialOrg[] }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const isFiltering = q.length > 0;

  const filtered = useMemo(() => {
    if (!isFiltering) return orgs;
    return orgs
      .map((o) => {
        const orgMatch = o.name.toLowerCase().includes(q);
        const accs = o.accounts.filter((a) => a.name.toLowerCase().includes(q));
        if (!orgMatch && accs.length === 0) return null;
        return orgMatch ? o : { ...o, accounts: accs };
      })
      .filter((o): o is CommercialOrg => o !== null);
  }, [orgs, q, isFiltering]);

  const totals = useMemo(() => {
    let accounts = 0;
    let rates = 0;
    let misc = 0;
    for (const o of filtered) {
      accounts += o.accounts.length;
      for (const a of o.accounts) {
        rates += a.rateCount;
        misc += a.miscCount;
      }
    }
    return { accounts, rates, misc };
  }, [filtered]);

  return (
    <div className="flex flex-col gap-5">
      <SearchBar
        value={query}
        onChange={setQuery}
        placeholder="Search by org or account name…"
        countLabel={`${totals.accounts} account${totals.accounts === 1 ? "" : "s"} · ${totals.rates} rate row${totals.rates === 1 ? "" : "s"} · ${totals.misc} misc fee${totals.misc === 1 ? "" : "s"}`}
      />

      <div className="flex flex-col gap-4">
        {filtered.map((o) => (
          <section
            key={o.id}
            className="glass overflow-hidden"
          >
            <div className="flex items-baseline justify-between border-b border-border bg-surface-2 px-4 py-3">
              <div className="flex items-baseline gap-3">
                <span className="text-sm font-semibold tracking-tightish">{o.name}</span>
                <span className="text-xs text-fg-subtle">
                  {o.outputTemplate} · {o.defaultCurrency}
                </span>
              </div>
              <span className="text-xs text-fg-subtle">
                {o.accounts.length} account{o.accounts.length === 1 ? "" : "s"}
              </span>
            </div>
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-fg-subtle">
                <tr className="border-b border-border">
                  <th className="px-4 py-2 text-left font-medium">Account</th>
                  <th className="px-4 py-2 text-left font-medium">Currency</th>
                  <th className="px-4 py-2 text-right font-medium">Rate rows</th>
                  <th className="px-4 py-2 text-right font-medium">Misc fees</th>
                  <th className="px-4 py-2 text-right font-medium">Assignments</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {o.accounts.map((a) => (
                  <tr
                    key={a.id}
                    className="border-b border-border last:border-b-0 transition-colors hover:bg-surface-2"
                  >
                    <td className="px-4 py-2.5">
                      <Link
                        className="font-medium text-fg hover:text-accent"
                        href={`/admin/accounts/${a.id}` as never}
                      >
                        {a.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-fg-muted">{a.currency}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{a.rateCount}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{a.miscCount}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{a.assignmentCount}</td>
                    <td className="px-4 py-2.5 text-right">
                      <Link
                        className="text-xs font-medium text-accent hover:text-accent-hover"
                        href={`/admin/accounts/${a.id}` as never}
                      >
                        Manage rates →
                      </Link>
                    </td>
                  </tr>
                ))}
                {o.accounts.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-4 text-sm text-fg-subtle">
                      No accounts under this org yet.{" "}
                      <Link
                        className="text-accent hover:text-accent-hover"
                        href={`/admin/orgs/${o.id}` as never}
                      >
                        Add one
                      </Link>
                      .
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        ))}

        {filtered.length === 0 && (
          <div className="rounded-lg border border-dashed border-border bg-surface p-8 text-center text-sm text-fg-muted">
            {isFiltering ? `No matches for "${query}".` : "No orgs yet."}
          </div>
        )}
      </div>
    </div>
  );
}
