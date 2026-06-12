import { prisma } from "@/lib/db";
import { monthRange } from "@/lib/invoice/period";
import { notDeleted } from "@/lib/domain/soft-delete";
import { DispatchGenerateForm } from "../dispatch/generate-form";

/** Dispatch preview + generate block (visits for the month + .xlsx button). */
export async function DispatchPreviewSection({
  accountId,
  year,
  month,
  showHeading = false,
}: {
  accountId: string;
  year: number;
  month: number;
  showHeading?: boolean;
}) {
  const range = monthRange(year, month);

  const visits = await prisma.dispatchVisit.findMany({
    where: {
      ...notDeleted,
      visitDate: { gte: range.start, lt: range.end },
      assignment: { clientAccountId: accountId },
    },
    include: {
      sla: true,
      assignment: { include: { technician: true } },
    },
    orderBy: { visitDate: "asc" },
  });

  const account = await prisma.clientAccount.findUnique({
    where: { id: accountId },
    select: { dispatchStandbyPerSite: true },
  });
  const standbyPerSite =
    account?.dispatchStandbyPerSite != null
      ? Number(account.dispatchStandbyPerSite.toString())
      : null;

  return (
    <section className="flex flex-col gap-3">
      {showHeading && (
        <h2 id="gen-dispatch" className="scroll-mt-24 text-lg font-semibold tracking-tightish">
          Dispatch
          <span className="ml-2 text-xs font-normal text-fg-subtle">
            {visits.length} visit{visits.length === 1 ? "" : "s"}
          </span>
        </h2>
      )}
      {visits.length === 0 ? (
        <div className="glass-soft rounded-lg px-4 py-3 text-sm text-fg-subtle">
          No dispatch visits for this period.
        </div>
      ) : (
        <>
          <section className="glass overflow-hidden rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-xs uppercase tracking-wider text-fg-subtle">
                <tr>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Technician</th>
                  <th className="px-3 py-2 text-left">SLA</th>
                  <th className="px-3 py-2 text-right">Hours</th>
                  <th className="px-3 py-2 text-left">Modifiers</th>
                </tr>
              </thead>
              <tbody>
                {visits.map((v) => (
                  <tr key={v.id} className="border-t border-border">
                    <td className="px-3 py-2 font-mono text-xs">
                      {v.visitDate.toISOString().slice(0, 10)}
                    </td>
                    <td className="px-3 py-2">
                      {v.assignment.technician.firstName} {v.assignment.technician.lastName}
                    </td>
                    <td className="px-3 py-2 text-fg-muted">{v.sla.code}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {Number(v.hoursOnSite.toString()).toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-xs text-fg-muted">
                      {[v.afterHours && "after-hours", v.weekend && "weekend"]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <DispatchGenerateForm
            accountId={accountId}
            year={year}
            month={month}
            standbyPerSite={standbyPerSite}
          />
        </>
      )}
    </section>
  );
}
