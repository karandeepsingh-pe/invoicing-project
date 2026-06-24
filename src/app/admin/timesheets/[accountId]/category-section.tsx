import Link from "next/link";
import { prisma } from "@/lib/db";
import { monthEntryCounts, partitionMonthAssignments } from "@/lib/domain/timesheet-month";
import { monthRange } from "@/lib/invoice/period";
import { TimesheetGrid, type GridAssignment, type GridCell } from "./timesheet-grid";
import { DeleteMonthButton } from "./delete-month-button";
import { DeletedRowsSection } from "./deleted-rows-section";
import { ScheduledBulkUploadDialog } from "./scheduled-bulk-upload-dialog";
import { isWithinWindow } from "@/lib/invoice/assignment-window";

type DayCategory = "DEDICATED" | "PROJECT_TM" | "SCHEDULED";

function fmtIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function categoryLabel(rc: DayCategory): string {
  if (rc === "PROJECT_TM") return "Project / T&M";
  if (rc === "SCHEDULED") return "Scheduled Visit";
  return "Dedicated FTE";
}

function typeSlug(rc: DayCategory): "dedicated" | "project" | "scheduled" {
  if (rc === "PROJECT_TM") return "project";
  if (rc === "SCHEDULED") return "scheduled";
  return "dedicated";
}

/**
 * One category's day-grid block (heading + soft-delete + grid + deleted rows),
 * self-contained so the combined "All" view can stack several of these and have
 * them load in parallel. `days` and `holidayDates` are passed in by the parent
 * (identical for every category in the same month) to avoid re-deriving them.
 */
export async function TimesheetCategorySection({
  accountId,
  year,
  month,
  rateCategory,
  defaultHours,
  softDeleteEnabled,
  holidayDates,
  days,
  showEditLink = true,
  headingId,
  stickyHeading = true,
}: {
  accountId: string;
  year: number;
  month: number;
  rateCategory: DayCategory;
  defaultHours: number;
  softDeleteEnabled: boolean;
  holidayDates: string[];
  days: string[];
  showEditLink?: boolean;
  headingId?: string;
  // Disable on the combined all-view, where a single sticky tab strip handles
  // navigation (two stacked sticky bars would overlap).
  stickyHeading?: boolean;
}) {
  const range = monthRange(year, month);
  const label = categoryLabel(rateCategory);

  const assignments = await prisma.assignment.findMany({
    where: {
      clientAccountId: accountId,
      rateCategory,
      startDate: { lt: range.end },
      OR: [{ endDate: null }, { endDate: { gte: range.start } }],
    },
    include: { technician: { include: { postalCode: true } } },
    orderBy: [
      { technician: { firstName: "asc" } },
      { technician: { lastName: "asc" } },
    ],
  });

  const monthEntries = await prisma.timesheetEntry.findMany({
    where: {
      assignmentId: { in: assignments.map((a) => a.id) },
      date: { gte: range.start, lt: range.end },
    },
    select: { assignmentId: true, date: true, hours: true, status: true, deletedAt: true },
  });

  const counts = monthEntryCounts(monthEntries, range);
  const partition = partitionMonthAssignments(assignments.map((a) => a.id), counts);
  const activeAssignments = assignments.filter((a) => partition.activeIds.has(a.id));
  const deletedRows = assignments
    .filter((a) => partition.deletedIds.has(a.id))
    .map((a) => ({
      assignmentId: a.id,
      technicianName: `${a.technician.firstName} ${a.technician.lastName}`,
      band: a.technician.band,
      deletedDays: partition.deletedCountById.get(a.id) ?? 0,
    }));

  // Per-assignment active window (end inclusive) — drives both which cells load
  // and which day columns the grid locks.
  const windowById = new Map<string, { start: string; end: string | null }>();
  for (const a of assignments) {
    windowById.set(a.id, {
      start: fmtIso(a.startDate),
      end: a.endDate ? fmtIso(a.endDate) : null,
    });
  }

  const cellsByAssignmentDate = new Map<string, GridCell>();
  for (const e of monthEntries) {
    if (e.deletedAt !== null) continue;
    const w = windowById.get(e.assignmentId);
    // Defensive: never surface an entry that falls outside its assignment window.
    if (w && !isWithinWindow(fmtIso(e.date), w.start, w.end)) continue;
    cellsByAssignmentDate.set(`${e.assignmentId}|${fmtIso(e.date)}`, {
      hours: e.status ? null : Number(e.hours.toString()),
      status: e.status,
    });
  }

  const gridAssignments: GridAssignment[] = activeAssignments.map((a) => ({
    assignmentId: a.id,
    technicianName: `${a.technician.firstName} ${a.technician.lastName}`,
    category:
      a.rateCategory === "PROJECT_TM"
        ? "PROJECT_TM"
        : a.rateCategory === "SCHEDULED"
          ? "SCHEDULED"
          : "DEDICATED",
    contactNo: a.technician.phone ?? undefined,
    location: a.technician.postalCode
      ? `${a.technician.postalCode.city}, ${a.technician.postalCode.state}`
      : "—",
    band: a.technician.band,
    slaTier: a.slaTier,
    startIso: fmtIso(a.startDate),
    endIso: a.endDate ? fmtIso(a.endDate) : null,
  }));

  const isDedicated = rateCategory === "DEDICATED";
  const qs = `year=${year}&month=${month}`;
  const editHref = `/admin/timesheets/${accountId}?${qs}&type=${typeSlug(rateCategory)}`;

  return (
    <section className="flex flex-col gap-3">
      <div className={`${stickyHeading ? "sticky top-14 z-20 md:top-0 " : ""}-mx-1 flex flex-wrap items-center justify-between gap-2 border-b border-border bg-bg px-1 py-2`}>
        <h2 id={headingId} className="scroll-mt-24 text-lg font-semibold tracking-tightish">
          {label}
          <span className="ml-2 text-xs font-normal text-fg-subtle">
            {gridAssignments.length} active
            {deletedRows.length > 0 ? ` · ${deletedRows.length} deleted` : ""}
          </span>
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {rateCategory === "SCHEDULED" && (
            <ScheduledBulkUploadDialog accountId={accountId} year={year} month={month} />
          )}
          {showEditLink && (
            <Link
              href={editHref}
              className="rounded-md border border-border-strong bg-surface px-2.5 py-1 text-xs font-medium text-fg-muted hover:bg-surface-2"
            >
              Edit only this →
            </Link>
          )}
          {softDeleteEnabled && gridAssignments.length > 0 && (
            <DeleteMonthButton
              accountId={accountId}
              rateCategories={[rateCategory]}
              year={year}
              month={month}
              label={label}
            />
          )}
        </div>
      </div>

      {gridAssignments.length === 0 && deletedRows.length === 0 ? (
        <div className="glass-soft rounded-lg px-4 py-3 text-sm text-fg-subtle">
          No {label} assignments overlap this month.
        </div>
      ) : (
        <>
          {gridAssignments.length > 0 && (
            <TimesheetGrid
              accountId={accountId}
              year={year}
              month={month}
              defaultHours={defaultHours}
              assignments={gridAssignments}
              days={days}
              initialCells={Object.fromEntries(cellsByAssignmentDate)}
              softDeleteEnabled={softDeleteEnabled}
              holidayDates={holidayDates}
              prefillHolidaysAsPh={isDedicated}
              prefillDefaultHours={isDedicated}
            />
          )}
          {softDeleteEnabled && deletedRows.length > 0 && (
            <DeletedRowsSection year={year} month={month} rows={deletedRows} />
          )}
        </>
      )}
    </section>
  );
}
