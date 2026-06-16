"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { SearchBar } from "@/components/admin/search-bar";
import { OrgDeleteButton } from "./delete-button";

export type OrgCard = {
  id: string;
  name: string;
  outputTemplate: string;
  defaultCurrency: string;
  accountCount: number;
  technicianCount: number;
};

export function OrgsGrid({ orgs }: { orgs: OrgCard[] }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const filtered = useMemo(
    () => (q ? orgs.filter((o) => o.name.toLowerCase().includes(q)) : orgs),
    [q, orgs],
  );

  return (
    <div className="flex flex-col gap-5">
      <SearchBar
        value={query}
        onChange={setQuery}
        placeholder="Search clients by name…"
        countLabel={`${filtered.length} of ${orgs.length}`}
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((o) => (
          <article
            key={o.id}
            className="glass group relative flex flex-col gap-4 rounded-xl p-5 transition-all hover:-translate-y-0.5"
          >
            <header className="flex items-start justify-between gap-3">
              <Link href={`/admin/orgs/${o.id}` as never} className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-sm font-bold tracking-tight text-accent">
                  {initials(o.name)}
                </div>
                <div className="flex flex-col leading-tight">
                  <span className="text-base font-semibold tracking-tightish text-fg group-hover:text-accent">
                    {o.name}
                  </span>
                  <span className="mt-0.5 text-[11px] uppercase tracking-wider text-fg-subtle">
                    {o.defaultCurrency}
                  </span>
                </div>
              </Link>
              <OutputBadge template={o.outputTemplate} />
            </header>

            <dl className="grid grid-cols-2 gap-2 text-xs">
              <Stat label="Accounts" value={o.accountCount} />
              <Stat label="Technicians" value={o.technicianCount} />
            </dl>

            <footer className="flex items-center justify-between gap-2 border-t border-border pt-3">
              <Link
                href={`/admin/orgs/${o.id}` as never}
                className="text-xs font-medium text-accent hover:text-accent-hover"
              >
                Open →
              </Link>
              <OrgDeleteButton id={o.id} name={o.name} />
            </footer>
          </article>
        ))}

        {filtered.length === 0 && (
          <div className="col-span-full rounded-xl border border-dashed border-border bg-surface p-8 text-center text-sm text-fg-muted">
            {q ? `No clients match "${query}".` : "No clients yet. Create one below."}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-surface-2 px-3 py-2">
      <div className="text-[10px] font-medium uppercase tracking-wider text-fg-subtle">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums text-fg">{value}</div>
    </div>
  );
}

function OutputBadge({ template }: { template: string }) {
  const isFso = template === "FSO";
  return (
    <span
      className={
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider " +
        (isFso ? "bg-accent/10 text-accent" : "bg-surface-2 text-fg-muted")
      }
      title={isFso ? "FSO format — HCL" : "Pre-Invoice format"}
    >
      {template}
    </span>
  );
}

function initials(name: string): string {
  const parts = name.replace(/[^A-Za-z0-9 ]+/g, " ").trim().split(/\s+/);
  if (parts.length === 0 || parts[0] === "") return "—";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
