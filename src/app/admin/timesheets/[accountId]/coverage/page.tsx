import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { notDeleted } from "@/lib/domain/soft-delete";
import { monthRange } from "@/lib/invoice/period";
import { CoverageView } from "./coverage-view";

export default async function CoveragePage({
  params,
  searchParams,
}: {
  params: Promise<{ accountId: string }>;
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const { accountId } = await params;
  const sp = await searchParams;
  const now = new Date();
  const year = sp.year ? Number(sp.year) : now.getUTCFullYear();
  const month = sp.month ? Number(sp.month) : now.getUTCMonth() + 1;

  const account = await prisma.clientAccount.findUnique({
    where: { id: accountId },
    include: { org: true },
  });
  if (!account) notFound();

  const range = monthRange(year, month);

  const assignments = await prisma.assignment.findMany({
    where: {
      clientAccountId: accountId,
      startDate: { lt: range.end },
      OR: [{ endDate: null }, { endDate: { gte: range.start } }],
    },
    include: { technician: true },
    orderBy: [
      { technician: { lastName: "asc" } },
      { technician: { firstName: "asc" } },
    ],
  });

  const events = await prisma.coverageEvent.findMany({
    where: {
      ...notDeleted,
      date: { gte: range.start, lt: range.end },
      coveredAssignmentId: { in: assignments.map((a) => a.id) },
    },
    include: {
      coveredAssignment: { include: { technician: true } },
      coveringAssignment: { include: { technician: true } },
    },
    orderBy: { date: "asc" },
  });

  const monthName = range.start.toLocaleString("en-US", {
    month: "long",
    timeZone: "UTC",
  });

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <header className="flex flex-col gap-1.5">
        <Link
          href={`/admin/timesheets/${accountId}?year=${year}&month=${month}`}
          className="text-xs font-medium text-fg-subtle hover:text-fg"
        >
          ← Timesheet
        </Link>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-accent">
          Backfill log
        </span>
        <h1 className="text-3xl font-semibold tracking-tighter2">
          {account.org.name} / {account.name} · {monthName} {year}
        </h1>
        <p className="text-sm text-fg-muted">
          Log who covered whom. Only valid when the covered technician&apos;s
          assignment slaTier = <code>BACKFILL</code>. The covering tech&apos;s
          line picks up the covered tech&apos;s rates at invoice time.
        </p>

        <details className="glass-soft rounded-md p-3 text-xs text-fg-muted">
          <summary className="cursor-pointer font-semibold text-fg">
            How coverage hours split
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong>Weekday event</strong>: hours up to Default Hours count as
              one regular day on the covering tech&apos;s line (the covered tech
              loses the same day). Anything above goes on the covering tech&apos;s
              OT bucket at the covered tech&apos;s OT rate.
            </li>
            <li>
              <strong>Sat / Sun event</strong>: every hour goes into the covering
              tech&apos;s Weekend bucket at the covered tech&apos;s Weekend rate.
              No day delta on either side.
            </li>
            <li>
              <strong>NO_BACKFILL / NONE</strong> covered tier: event is skipped
              at invoice time and surfaced as a warning.
            </li>
          </ul>
        </details>
      </header>

      <CoverageView
        accountId={accountId}
        year={year}
        month={month}
        assignments={assignments.map((a) => ({
          id: a.id,
          name: `${a.technician.firstName} ${a.technician.lastName}`,
          slaTier: a.slaTier,
          rateCategory: a.rateCategory,
        }))}
        events={events.map((e) => ({
          id: e.id,
          date: e.date.toISOString().slice(0, 10),
          covered: `${e.coveredAssignment.technician.firstName} ${e.coveredAssignment.technician.lastName}`,
          covering: `${e.coveringAssignment.technician.firstName} ${e.coveringAssignment.technician.lastName}`,
          hours: Number(e.hours.toString()),
          notes: e.notes,
        }))}
      />
    </div>
  );
}
