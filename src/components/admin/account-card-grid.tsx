"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { SearchBar } from "@/components/admin/search-bar";
import { filterByText } from "@/lib/display/option-filter";

export type AccountCardItem = {
  id: string;
  orgName: string;
  name: string;
  href: string;
  /** Pre-formatted counts line, built server-side. */
  metaLine: string;
};

/** Searchable glass-card grid for the Timesheets / Invoices account landings. */
export function AccountCardGrid({
  accounts,
  placeholder,
}: {
  accounts: AccountCardItem[];
  placeholder: string;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(
    () => filterByText(accounts, query, (a) => `${a.orgName} ${a.name}`),
    [accounts, query],
  );

  return (
    <div className="flex flex-col gap-3">
      <SearchBar
        value={query}
        onChange={setQuery}
        placeholder={placeholder}
        countLabel={`${filtered.length} of ${accounts.length} accounts`}
      />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((a) => (
          <Link
            key={a.id}
            href={a.href as never}
            className="glass group flex flex-col gap-2 rounded-xl p-4 transition-all hover:-translate-y-0.5"
          >
            <span className="text-xs text-fg-subtle">{a.orgName}</span>
            <span className="text-base font-semibold tracking-tightish text-fg group-hover:text-accent">
              {a.name}
            </span>
            <span className="text-[11px] text-fg-subtle">{a.metaLine}</span>
          </Link>
        ))}
        {accounts.length === 0 && (
          <p className="col-span-full text-sm text-fg-subtle">No accounts yet.</p>
        )}
        {accounts.length > 0 && filtered.length === 0 && (
          <p className="col-span-full text-sm text-fg-subtle">
            No accounts match &ldquo;{query}&rdquo;.
          </p>
        )}
      </div>
    </div>
  );
}
