import { prisma } from "@/lib/db";
import { businessDaysInRange, monthRange } from "@/lib/invoice/period";
import { splitEntries } from "@/lib/invoice/hours-split";
import { loadFteRows } from "@/lib/invoice/fte-rows";
import { GenerateForm, type AssignmentPreview } from "../generate-form";

/**
 * Dedicated FTE preview + generate block. Self-contained so it can render on the
 * FTE generate page and inside the combined "All categories" view. The preview
 * table and the .xlsx button both live inside GenerateForm.
 */
export async function FtePreviewSection({
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
      rateCategory: "DEDICATED",
      startDate: { lt: range.end },
      OR: [{ endDate: null }, { endDate: { gte: range.start } }],
    },
    include: {
      technician: { include: { postalCode: true } },
      timesheetEntries: { where: { date: { gte: range.start, lt: range.end } } },
    },
    orderBy: [
      { technician: { lastName: "asc" } },
      { technician: { firstName: "asc" } },
    ],
  });

  // PH / PTO bill as paid working days (see hours-split.ts), so the informational
  // "Business Days" reference is simply the month's weekday count — matching the
  // engine in fte-rows.ts. (Was previously subtracting PH dates, which diverged.)
  const businessDays = businessDaysInRange(range, []);

  const previews: AssignmentPreview[] = assignments.map((a) => {
    const split = splitEntries(
      a.timesheetEntries.map((e) => ({ date: e.date, hours: e.hours, status: e.status })),
      defaultHours,
    );
    return {
      assignmentId: a.id,
      technicianName: `${a.technician.firstName} ${a.technician.lastName}`,
      band: a.technician.band,
      backfillLabel:
        a.slaTier === "BACKFILL" ? "Backfill" : a.slaTier === "NO_BACKFILL" ? "No Backfill" : "",
      daysWorked: Number(split.regularDays.toFixed(2)),
      otHours: Number(split.otHours.toFixed(2)),
      weekendHours: Number(split.weekendHours.toFixed(2)),
    };
  });

  const { unpriced } = await loadFteRows(accountId, range);

  return (
    <section className="flex flex-col gap-3">
      {showHeading && (
        <h2 id="gen-dedicated" className="scroll-mt-24 text-lg font-semibold tracking-tightish">
          Dedicated FTE
          <span className="ml-2 text-xs font-normal text-fg-subtle">
            {previews.length} assignment{previews.length === 1 ? "" : "s"} · {businessDays} business days
          </span>
        </h2>
      )}
      {previews.length === 0 ? (
        <div className="glass-soft rounded-lg px-4 py-3 text-sm text-fg-subtle">
          No Dedicated FTE assignments overlap this month.
        </div>
      ) : (
        <GenerateForm
          accountId={accountId}
          year={year}
          month={month}
          businessDays={businessDays}
          assignments={previews}
          unpriced={unpriced}
        />
      )}
    </section>
  );
}
