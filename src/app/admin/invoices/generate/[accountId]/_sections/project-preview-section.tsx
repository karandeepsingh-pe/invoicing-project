import { prisma } from "@/lib/db";
import { monthRange } from "@/lib/invoice/period";
import { computeDaysWorked } from "@/lib/invoice/dedicated-fte-calculator";
import { ProjectGenerateForm } from "../project/generate-form";

/**
 * Project / T&M preview + generate block. `daysWorked` shown here is a display
 * figure (computed at the account's default hours); the billed amount is resolved
 * server-side by the generate action against the rate sheet.
 */
export async function ProjectPreviewSection({
  accountId,
  year,
  month,
  defaultHours,
  showHeading = false,
}: {
  accountId: string;
  year: number;
  month: number;
  defaultHours: number;
  showHeading?: boolean;
}) {
  const range = monthRange(year, month);

  const assignments = await prisma.assignment.findMany({
    where: {
      clientAccountId: accountId,
      rateCategory: "PROJECT_TM",
      startDate: { lt: range.end },
      OR: [{ endDate: null }, { endDate: { gte: range.start } }],
    },
    include: {
      technician: true,
      timesheetEntries: { where: { date: { gte: range.start, lt: range.end } } },
    },
    orderBy: [
      { technician: { lastName: "asc" } },
      { technician: { firstName: "asc" } },
    ],
  });

  const previews = assignments.map((a) => ({
    id: a.id,
    name: `${a.technician.firstName} ${a.technician.lastName}`,
    band: a.technician.band,
    daysWorked: Number(
      computeDaysWorked(
        a.timesheetEntries.map((e) => ({ hours: e.hours, status: e.status })),
        defaultHours,
      ).toFixed(2),
    ),
  }));

  return (
    <section className="flex flex-col gap-3">
      {showHeading && (
        <h2 id="gen-project" className="scroll-mt-24 text-lg font-semibold tracking-tightish">
          Project / T&amp;M
          <span className="ml-2 text-xs font-normal text-fg-subtle">
            {previews.length} assignment{previews.length === 1 ? "" : "s"}
          </span>
        </h2>
      )}
      {previews.length === 0 ? (
        <div className="glass-soft rounded-lg px-4 py-3 text-sm text-fg-subtle">
          No Project / T&amp;M assignments overlap this month.
        </div>
      ) : (
        <>
          <section className="glass overflow-hidden rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-xs uppercase tracking-wider text-fg-subtle">
                <tr>
                  <th className="px-3 py-2 text-left">Technician</th>
                  <th className="px-3 py-2 text-left">Band</th>
                  <th className="px-3 py-2 text-right">Days Worked</th>
                </tr>
              </thead>
              <tbody>
                {previews.map((p) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="px-3 py-2 font-medium">{p.name}</td>
                    <td className="px-3 py-2 text-fg-muted">Band {p.band}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.daysWorked.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <ProjectGenerateForm accountId={accountId} year={year} month={month} />
        </>
      )}
    </section>
  );
}
