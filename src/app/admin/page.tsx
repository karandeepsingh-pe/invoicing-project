import Link from "next/link";
import { loadDashboardOverview } from "@/lib/dashboard/overview";
import { accountScopeWhere, requireSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

function money(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtRunTime(d: Date): string {
  return d.toLocaleString("en-US", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
}

export default async function AdminDashboard() {
  const session = await requireSession();
  const isAdmin = session.role === "ADMIN";
  const o = await loadDashboardOverview(new Date(), accountScopeWhere(session));
  const qs = `year=${o.month.year}&month=${o.month.month}`;
  const active = o.accounts.filter((a) => a.hasActivity);
  const idle = o.accounts.filter((a) => !a.hasActivity);
  const grandTotal = active.reduce((n, a) => n + a.subtotal, 0);
  const ex = o.exceptions;
  const hasExceptions =
    ex.overriddenBookings > 0 || ex.ptoDays > 0 || ex.abDays > 0 || ex.standbyMissing.length > 0;

  return (
    <div className="flex flex-col gap-12 animate-fade-in">
      {/* ── Masthead ── */}
      <header className="flex flex-col gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.25em] text-accent">
          Dashboard
        </span>
        <h1 className="text-4xl text-fg sm:text-5xl">{o.month.label}</h1>
        <p className="text-sm text-fg-muted">
          {o.month.businessDays} business days · {o.month.weekdaysElapsed} of{" "}
          {o.month.weekdaysTotal} weekdays elapsed ·{" "}
          {o.month.holidays.length === 0
            ? "no public holidays"
            : o.month.holidays.map((h) => `${h.name} (${h.date.slice(8)}th) excluded`).join(", ")}
        </p>
        <div className="mt-1 h-px w-16 bg-accent" aria-hidden="true" />
      </header>

      <div className="grid grid-cols-1 gap-12 lg:grid-cols-3">
        {/* ── Left: readiness + revenue ── */}
        <div className="flex flex-col gap-12 lg:col-span-2">
          <section className="flex flex-col gap-3">
            <h2 className="text-xl">Month readiness</h2>
            <p className="text-xs text-fg-muted">
              What still needs sorting before {o.month.label} can be invoiced.
            </p>
            <div className="glass overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-2 text-[10px] uppercase tracking-[0.18em] text-fg-muted">
                  <tr>
                    <th className="px-3 py-2 text-left">Account</th>
                    <th className="px-3 py-2 text-right">Blank cells</th>
                    <th className="px-3 py-2 text-right">Unpriced</th>
                    <th className="px-3 py-2 text-right">Cancel pending</th>
                    <th className="px-3 py-2 text-center">Generated</th>
                    <th className="px-3 py-2 text-right"></th>
                  </tr>
                </thead>
                <tbody>
                  {active.map((a) => {
                    const issues = a.blankWeekdayCells + a.unpricedCount + a.cancelledPending;
                    const dot =
                      issues === 0 && a.generated
                        ? "bg-success"
                        : issues === 0
                          ? "bg-warning"
                          : "bg-danger";
                    return (
                      <tr key={a.id} className="border-t border-border transition-colors hover:bg-surface-2/40">
                        <td className="px-3 py-2.5">
                          <span className="flex items-center gap-2.5">
                            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
                            <span className="min-w-0">
                              <span className="block truncate font-medium text-fg">{a.name}</span>
                              <span className="block text-[10px] uppercase tracking-wider text-fg-subtle">
                                {a.orgName}
                              </span>
                            </span>
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {a.blankWeekdayCells > 0 ? (
                            <Link
                              href={`/admin/timesheets/${a.id}?${qs}` as never}
                              className="font-medium text-warning hover:underline"
                            >
                              {a.blankWeekdayCells}
                            </Link>
                          ) : (
                            <span className="text-fg-subtle">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {a.unpricedCount > 0 ? (
                            <Link
                              href={`/admin/accounts/${a.id}` as never}
                              className="font-medium text-danger hover:underline"
                            >
                              {a.unpricedCount}
                            </Link>
                          ) : (
                            <span className="text-fg-subtle">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {a.cancelledPending > 0 ? (
                            <Link
                              href={`/admin/dispatch-visits/${a.id}?${qs}` as never}
                              className="font-medium text-warning hover:underline"
                            >
                              {a.cancelledPending}
                            </Link>
                          ) : (
                            <span className="text-fg-subtle">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {a.generated ? (
                            <span className="text-success">✓</span>
                          ) : (
                            <span className="text-fg-subtle">·</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span className="flex justify-end gap-3 whitespace-nowrap text-xs">
                            <Link
                              href={`/admin/timesheets/${a.id}?${qs}` as never}
                              className="text-fg-muted transition-colors hover:text-fg"
                            >
                              Timesheet →
                            </Link>
                            <Link
                              href={`/admin/invoices/generate/${a.id}/combined?${qs}` as never}
                              className="text-accent transition-colors hover:text-accent-hover"
                            >
                              Generate →
                            </Link>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {active.length === 0 && (
                    <tr className="border-t border-border">
                      <td colSpan={6} className="px-3 py-6 text-sm text-fg-subtle">
                        Nothing billable for {o.month.label} yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {idle.length > 0 && (
              <p className="text-[11px] text-fg-subtle">
                No activity this month: {idle.map((a) => a.name).join(", ")}
              </p>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-xl">Revenue snapshot</h2>
            <div className="glass-soft flex flex-col">
              {active.map((a) => (
                <Link
                  key={a.id}
                  href={`/admin/invoices/generate/${a.id}/combined?${qs}` as never}
                  className="group flex items-baseline justify-between gap-4 border-b border-border/60 py-3 transition-colors hover:bg-surface-2/30"
                >
                  <span className="truncate text-sm text-fg-muted transition-colors group-hover:text-fg">
                    {a.name}
                  </span>
                  <span className="tabular-nums text-lg text-fg">{money(a.subtotal)}</span>
                </Link>
              ))}
              <div className="flex items-baseline justify-between gap-4 pt-4">
                <span className="font-display text-lg text-fg">Total · {o.month.label}</span>
                <span className="tabular-nums font-display text-2xl text-fg">
                  {money(grandTotal)}
                </span>
              </div>
            </div>
            <p className="text-[10px] text-fg-subtle">
              Calculated from the rate sheets, so it matches the Generate previews. It leaves out
              retainers, standby, and misc fees, which are added at generation time.
            </p>
          </section>
        </div>

        {/* ── Right: actions + activity + exceptions ── */}
        <div className="flex flex-col gap-10">
          <section className="flex flex-col gap-3">
            <h2 className="text-xl">Quick actions</h2>
            <div className="glass-soft flex flex-col text-sm">
              {o.accounts.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between gap-2 border-b border-border/60 py-2"
                >
                  <span className="truncate text-fg-muted">{a.name}</span>
                  <span className="flex shrink-0 gap-3 text-xs">
                    <Link
                      href={`/admin/timesheets/${a.id}?${qs}` as never}
                      className="text-fg-muted transition-colors hover:text-fg"
                    >
                      Timesheet
                    </Link>
                    <Link
                      href={`/admin/dispatch-visits/${a.id}?${qs}` as never}
                      className="text-fg-muted transition-colors hover:text-fg"
                    >
                      Dispatch
                    </Link>
                    <Link
                      href={`/admin/invoices/generate/${a.id}/combined?${qs}` as never}
                      className="text-accent transition-colors hover:text-accent-hover"
                    >
                      Generate
                    </Link>
                  </span>
                </div>
              ))}
              {isAdmin && (
                <Link
                  href={"/admin/masters/holidays" as never}
                  className="py-2 text-xs text-fg-muted transition-colors hover:text-fg"
                >
                  Public holidays master →
                </Link>
              )}
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-xl">Recent activity</h2>
            <div className="glass-soft flex flex-col text-xs">
              {o.runs.map((r) => (
                <div key={r.id} className="border-b border-border/60 py-2.5 last:border-b-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-medium text-fg">
                      {r.accountName} · {r.periodLabel}
                    </span>
                    <span className="shrink-0 tabular-nums text-fg-subtle">
                      {fmtRunTime(r.generatedAt)}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[10px] uppercase tracking-wider text-fg-subtle">
                    {r.format} · {r.generatedBy}
                  </div>
                </div>
              ))}
              {o.runs.length === 0 && (
                <p className="py-3 text-fg-subtle">No invoices generated yet.</p>
              )}
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-xl">Exceptions</h2>
            <div className="glass-soft flex flex-col gap-2 py-3 text-xs text-fg-muted">
              {ex.overriddenBookings > 0 && (
                <span>
                  <span className="font-medium text-warning">{ex.overriddenBookings}</span>{" "}
                  booking conflict{ex.overriddenBookings === 1 ? "" : "s"} overridden this month
                </span>
              )}
              {ex.ptoDays > 0 && (
                <span>
                  <span className="font-medium text-fg">{ex.ptoDays}</span> PTO day
                  {ex.ptoDays === 1 ? "" : "s"} logged (paid, not billed)
                </span>
              )}
              {ex.abDays > 0 && (
                <span>
                  <span className="font-medium text-fg">{ex.abDays}</span> absence
                  {ex.abDays === 1 ? "" : "s"} logged
                </span>
              )}
              {ex.standbyMissing.length > 0 && (
                <span>
                  Standby $/site not set despite dispatch volume:{" "}
                  <span className="font-medium text-warning">{ex.standbyMissing.join(", ")}</span>
                </span>
              )}
              {!hasExceptions && <span className="text-fg-subtle">Nothing flagged.</span>}
            </div>
          </section>
        </div>
      </div>

      {/* ── Footer counts ── */}
      <p className="border-t border-border pt-4 text-xs text-fg-subtle">
        {isAdmin ? (
          <Link href={"/admin/management" as never} className="transition-colors hover:text-fg">
            {o.counts.accounts} accounts · {o.counts.technicians} technicians ·{" "}
            {o.counts.assignments} assignments · manage in Client Management →
          </Link>
        ) : (
          <span>
            {o.counts.accounts} account{o.counts.accounts === 1 ? "" : "s"} ·{" "}
            {o.counts.assignments} assignment{o.counts.assignments === 1 ? "" : "s"}
          </span>
        )}
      </p>
    </div>
  );
}
