import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { notDeleted } from "@/lib/domain/soft-delete";
import { businessDaysInRange } from "@/lib/invoice/period";
import {
  calculateDedicatedFteRow,
  type RateRow,
  type TimesheetCell,
} from "./dedicated-fte-calculator";
import { ratesForTechnicianInRange } from "@/lib/domain/account-rate-resolver";
import {
  applyCoverageEvents,
  type CoverageContext,
  type CoverageEventInput,
} from "./coverage";
import { deriveRebadgedRates } from "./rebadged-rates";
import type { PreInvoiceRow } from "./render-pre-invoice";

function slaTierLabel(tier: "BACKFILL" | "NO_BACKFILL" | "NONE"): string {
  if (tier === "BACKFILL") return "Backfill";
  if (tier === "NO_BACKFILL") return "No Backfill";
  return "";
}

/**
 * Load + compute the Dedicated FTE pre-invoice rows for an account + month,
 * including coverage (backfill) adjustments. Self-contained (does its own
 * queries) so both the single FTE generator and the combined generator share
 * one source of truth.
 */
export async function loadFteRows(
  accountId: string,
  range: { start: Date; end: Date },
): Promise<PreInvoiceRow[]> {
  const account = await prisma.clientAccount.findUnique({
    where: { id: accountId },
    select: {
      defaultHours: true,
      accountRates: { include: { rateSubCategory: true, sla: true } },
    },
  });
  if (!account) return [];
  const defaultHours = account.defaultHours;
  const accountRates = account.accountRates;

  const assignments = await prisma.assignment.findMany({
    where: {
      clientAccountId: accountId,
      rateCategory: "DEDICATED",
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

  const phDateSet = new Set<string>();
  for (const a of assignments) {
    for (const e of a.timesheetEntries) {
      if (e.status === "PH") phDateSet.add(e.date.toISOString().slice(0, 10));
    }
  }
  const phDates = Array.from(phDateSet).map((iso) => new Date(`${iso}T00:00:00.000Z`));
  const businessDays = businessDaysInRange(range, phDates);

  // Resolve { dayRate, ot, weekend } for an assignment. The rate sheet stores an
  // HOURLY rate, so dayRate = hourly × account defaultHours. Rebadged is the same
  // shape: dayRate = (salary ÷ 2080) × defaultHours. OT/weekend stay per-hour.
  type AssignmentWithTech = (typeof assignments)[number];
  function resolveRates(a: AssignmentWithTech) {
    if (a.technician.isRebadged) {
      const { dayRate } = deriveRebadgedRates(Number(a.technician.annualSalary ?? 0), defaultHours);
      return {
        dayRate: new Prisma.Decimal(dayRate),
        ot: new Prisma.Decimal(a.technician.rebadgedOtRate?.toString() ?? "0"),
        weekend: new Prisma.Decimal(a.technician.rebadgedWeekendRate?.toString() ?? "0"),
      };
    }
    const techRates = ratesForTechnicianInRange(
      accountRates,
      "DEDICATED",
      a.technician.band,
      range.start,
      range.end,
    );
    const dayRateRow = techRates.find(
      (r) =>
        (r.rateSubCategory.code === "MONTHLY_DAY_RATE" ||
          r.rateSubCategory.code === "ANNUAL_BACKFILL") &&
        r.sla.code === a.slaTier,
    );
    const otRow = techRates.find(
      (r) =>
        (r.rateSubCategory.code === "OT_HOURLY_RATE" ||
          r.rateSubCategory.code === "HOURLY_BACKFILL_OT") &&
        r.sla.code === a.slaTier,
    );
    const weekendRow = techRates.find(
      (r) =>
        (r.rateSubCategory.code === "WEEKEND_HOURLY_RATE" ||
          r.rateSubCategory.code === "HOURLY_BACKFILL_WEEKEND") &&
        r.sla.code === a.slaTier,
    );
    return {
      // Rate sheet value is an HOURLY rate → day rate = hourly × defaultHours.
      dayRate: new Prisma.Decimal(dayRateRow?.rateAmount?.toString() ?? 0).times(defaultHours),
      ot: new Prisma.Decimal(otRow?.rateAmount?.toString() ?? 0),
      weekend: new Prisma.Decimal(weekendRow?.rateAmount?.toString() ?? 0),
    };
  }

  const assignmentIds = assignments.map((a) => a.id);
  const coverageRows = await prisma.coverageEvent.findMany({
    where: {
      ...notDeleted,
      date: { gte: range.start, lt: range.end },
      coveredAssignmentId: { in: assignmentIds },
    },
  });

  const contextByAssignment = new Map<string, CoverageContext>();
  const techNameByAssignment = new Map<string, string>();
  for (const a of assignments) {
    const rr = resolveRates(a);
    contextByAssignment.set(a.id, {
      assignmentId: a.id,
      slaTier: a.slaTier,
      dayRate: rr.dayRate,
      otRate: rr.ot,
      weekendRate: rr.weekend,
    });
    techNameByAssignment.set(a.id, `${a.technician.firstName} ${a.technician.lastName}`);
  }

  const coverageEvents: CoverageEventInput[] = coverageRows.map((e) => ({
    id: e.id,
    coveredAssignmentId: e.coveredAssignmentId,
    coveringAssignmentId: e.coveringAssignmentId,
    date: e.date,
    hours: e.hours,
  }));
  const coverage = applyCoverageEvents({
    events: coverageEvents,
    contextByAssignment,
    defaultHours,
    technicianNameByAssignment: techNameByAssignment,
  });

  const rows: PreInvoiceRow[] = [];
  for (const a of assignments) {
    const rr = resolveRates(a);
    const rates: RateRow[] = [
      { rateAmount: rr.dayRate, rateSubCategory: { code: "MONTHLY_DAY_RATE" }, sla: { code: a.slaTier } },
      { rateAmount: rr.ot, rateSubCategory: { code: "OT_HOURLY_RATE" }, sla: { code: a.slaTier } },
      { rateAmount: rr.weekend, rateSubCategory: { code: "WEEKEND_HOURLY_RATE" }, sla: { code: a.slaTier } },
    ];
    const entries: TimesheetCell[] = a.timesheetEntries.map((e) => ({
      date: e.date,
      hours: e.hours,
      status: e.status,
    }));

    const calc = calculateDedicatedFteRow({
      defaultHours,
      businessDays,
      entries,
      rates,
      slaTier: a.slaTier,
      coverageDaysDelta: coverage.daysDeltaByAssignment.get(a.id),
      coverageOtDelta: coverage.otDeltaByAssignment.get(a.id),
      coverageWeekendDelta: coverage.weekendDeltaByAssignment.get(a.id),
      overrideDayRate: coverage.overrideRateByCoveringAssignment.get(a.id),
      overrideOtRate: coverage.overrideOtRateByCoveringAssignment.get(a.id),
      overrideWeekendRate: coverage.overrideWeekendRateByCoveringAssignment.get(a.id),
    });

    const daysWorkedNum = Number(calc.daysWorked.toFixed(2));
    const otHoursNum = Number(calc.otHours.toFixed(2));
    const weekendHoursNum = Number(calc.weekendHours.toFixed(2));
    if (daysWorkedNum === 0 && otHoursNum === 0 && weekendHoursNum === 0) continue;

    const location = a.technician.postalCode
      ? `${a.technician.postalCode.city}, ${a.technician.postalCode.state}`
      : "—";

    const remarkParts: string[] = coverage.remarksByAssignment.get(a.id) ?? [];
    const breakdownBits: string[] = [];
    if (otHoursNum > 0) {
      breakdownBits.push(`OT ${otHoursNum.toFixed(2)}h @ $${Number(calc.otRate.toFixed(2))}`);
    }
    if (weekendHoursNum > 0) {
      breakdownBits.push(`Weekend ${weekendHoursNum.toFixed(2)}h @ $${Number(calc.weekendRate.toFixed(2))}`);
    }
    if (breakdownBits.length > 0) remarkParts.push(breakdownBits.join(" · "));

    rows.push({
      location,
      technicianName: `${a.technician.firstName} ${a.technician.lastName}`,
      bandLabel: a.technician.isRebadged ? "Rebadged" : `Band ${a.technician.band}`,
      backfillLabel: slaTierLabel(a.slaTier),
      engineerType: "FTE",
      businessDays,
      daysWorked: daysWorkedNum,
      dayRate: calc.dayRate.toNumber(),
      otHours: otHoursNum,
      otRate: Number(calc.otRate.toFixed(2)),
      weekendHours: weekendHoursNum,
      weekendRate: Number(calc.weekendRate.toFixed(2)),
      extendedTotal: Number(calc.extendedTotal.toFixed(2)),
      remarks: remarkParts.length > 0 ? remarkParts.join(" · ") : undefined,
    });
  }

  return rows;
}
