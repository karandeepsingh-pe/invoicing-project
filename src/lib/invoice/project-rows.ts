import { prisma } from "@/lib/db";
import { notDeleted } from "@/lib/domain/soft-delete";
import {
  calculateProjectRow,
  type ProjectRateRow,
  type ProjectTimesheetCell,
} from "./project-calculator";
import type { ProjectRow } from "./render-project";

const DEFAULT_HOURS = 8;

/** Load + compute the Project / T&M pre-invoice rows for an account + month. */
export async function loadProjectRows(
  accountId: string,
  range: { start: Date; end: Date },
): Promise<ProjectRow[]> {
  const account = await prisma.clientAccount.findUnique({
    where: { id: accountId },
    select: { accountRates: { include: { rateSubCategory: true, sla: true } } },
  });
  if (!account) return [];

  const assignments = await prisma.assignment.findMany({
    where: {
      clientAccountId: accountId,
      rateCategory: "PROJECT_TM",
      startDate: { lt: range.end },
      OR: [{ endDate: null }, { endDate: { gte: range.start } }],
    },
    include: {
      technician: { include: { postalCode: true } },
      timesheetEntries: {
        where: { ...notDeleted, date: { gte: range.start, lt: range.end } },
      },
    },
    orderBy: [
      { technician: { lastName: "asc" } },
      { technician: { firstName: "asc" } },
    ],
  });

  const projectRates: ProjectRateRow[] = account.accountRates
    .filter((r) => r.rateSubCategory.rateCategory === "PROJECT_TM")
    .map((r) => ({
      rateAmount: r.rateAmount,
      band: r.band,
      rateSubCategory: { code: r.rateSubCategory.code },
      sla: { code: r.sla.code },
    }));

  const rows: ProjectRow[] = [];
  for (const a of assignments) {
    const entries: ProjectTimesheetCell[] = a.timesheetEntries.map((e) => ({
      hours: e.hours,
      status: e.status,
    }));
    const calc = calculateProjectRow({
      defaultHours: DEFAULT_HOURS,
      band: a.technician.band,
      entries,
      rates: projectRates,
    });
    const daysWorkedNum = Number(calc.daysWorked.toFixed(2));
    if (daysWorkedNum === 0) continue;

    const location = a.technician.postalCode
      ? `${a.technician.postalCode.city}, ${a.technician.postalCode.state}`
      : "—";

    rows.push({
      location,
      technicianName: `${a.technician.firstName} ${a.technician.lastName}`,
      bandLabel: `Band ${a.technician.band}`,
      engineerType: "Project",
      dayRate: Number(calc.dayRate.toFixed(2)),
      daysWorked: daysWorkedNum,
      extendedTotal: Number(calc.extendedTotal.toFixed(2)),
    });
  }
  return rows;
}
