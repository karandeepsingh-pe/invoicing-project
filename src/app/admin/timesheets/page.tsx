import { prisma } from "@/lib/db";
import { accountScopeWhere, requireSession } from "@/lib/auth/session";
import { AccountCardGrid } from "@/components/admin/account-card-grid";

export default async function TimesheetsLanding() {
  const session = await requireSession();
  const accounts = await prisma.clientAccount.findMany({
    where: accountScopeWhere(session),
    orderBy: { name: "asc" },
    include: {
      org: { select: { name: true } },
      _count: { select: { assignments: true } },
    },
  });

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <header className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.25em] text-accent">
          Workspace
        </span>
        <h1 className="text-3xl font-semibold tracking-tighter2 sm:text-4xl">Timesheets</h1>
        <p className="max-w-2xl text-sm text-fg-muted">
          Pick an account to open its monthly timesheet grid.
        </p>
        <details className="glass-soft mt-2 max-w-2xl rounded-md p-3 text-xs text-fg-muted">
          <summary className="cursor-pointer font-semibold text-fg">
            What the cell codes mean
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong>A number</strong> is the hours worked. On weekdays, hours up to
              Default Hours are regular and the rest is OT. Saturday and Sunday hours go
              into the weekend bucket.
            </li>
            <li>
              <strong><code>PH</code></strong> is a public holiday. It isn&apos;t a worked
              day, and it lowers the month&apos;s business days.
            </li>
            <li>
              <strong><code>AB</code></strong> is absent. On a Backfill assignment, log
              who covered in the account&apos;s Backfill log.
            </li>
            <li>
              <strong><code>NA</code></strong> means not applicable, or the technician has
              left.
            </li>
            <li>
              A <strong>blank</strong> weekday fills with Default Hours when the page
              reloads. Use <code>AB</code> or <code>PH</code> when you really mean zero.
            </li>
          </ul>
        </details>
      </header>

      <AccountCardGrid
        placeholder="Search accounts by name or client…"
        accounts={accounts.map((a) => ({
          id: a.id,
          orgName: a.org.name,
          name: a.name,
          href: `/admin/timesheets/${a.id}`,
          metaLine: `${a._count.assignments} assignment${a._count.assignments === 1 ? "" : "s"}`,
        }))}
      />
    </div>
  );
}
