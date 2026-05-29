import Link from "next/link";
import { prisma } from "@/lib/db";

export default async function TimesheetsLanding() {
  const accounts = await prisma.clientAccount.findMany({
    orderBy: [{ org: { name: "asc" } }, { name: "asc" }],
    include: {
      org: { select: { name: true } },
      _count: { select: { assignments: true } },
    },
  });

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <header className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-accent">
          Workspace
        </span>
        <h1 className="text-4xl font-semibold tracking-tighter2">Timesheets</h1>
        <p className="max-w-2xl text-sm text-fg-muted">
          Pick an account to open its monthly timesheet grid.
        </p>
        <details className="glass-soft mt-2 max-w-2xl rounded-md p-3 text-xs text-fg-muted">
          <summary className="cursor-pointer font-semibold text-fg">
            Cell codes — quick reference
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong>Number</strong> — hours worked. Weekday: regular up to
              Default Hours, OT above. Sat/Sun: Weekend bucket.
            </li>
            <li>
              <strong><code>PH</code></strong> — Public Holiday. Reduces Business
              Days for the month.
            </li>
            <li>
              <strong><code>AB</code></strong> — Absent. On BACKFILL tier, log a
              coverage event under the account&apos;s Backfill log.
            </li>
            <li>
              <strong><code>NA</code></strong> — Terminated / Not Applicable.
            </li>
            <li>
              <strong>Blank</strong> — pre-fills with Default Hours on next
              reload. Use <code>AB</code>/<code>PH</code> for intentional zeros.
            </li>
          </ul>
        </details>
      </header>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {accounts.map((a) => (
          <Link
            key={a.id}
            href={`/admin/timesheets/${a.id}` as never}
            className="glass group flex flex-col gap-2 rounded-xl p-4 transition-all hover:-translate-y-0.5"
          >
            <span className="text-xs text-fg-subtle">{a.org.name}</span>
            <span className="text-base font-semibold tracking-tightish text-fg group-hover:text-accent">
              {a.name}
            </span>
            <span className="text-[11px] text-fg-subtle">
              {a._count.assignments} assignment{a._count.assignments === 1 ? "" : "s"}
            </span>
          </Link>
        ))}
        {accounts.length === 0 && (
          <p className="col-span-full text-sm text-fg-subtle">No accounts yet.</p>
        )}
      </div>
    </div>
  );
}
