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
import { annualFromBandHourly, dedicatedDayRate } from "./billing-basis";
import type { PreInvoiceRow } from "./render-pre-invoice";

function slaTierLabel(tier: "BACKFILL" | "NO_BACKFILL" | "NONE"): string {
  if (tier === "BACKFILL") return "Backfill";
  if (tier === "NO_BACKFILL") return "No Backfill";
  return "";
}

// A dedicated assignment that has worked days in the period but no resolvable
// (active, non-null) rate, so it would otherwise bill 0. Surfaced for review
// instead of emitting a silent $0 line.
export type UnpricedFteAssignment = {
  assignmentId: string;
  technicianName: string;
  band: number;
  backfillLabel: string;
  daysWorked: number;
};

export type FteRowsResult = {
  rows: PreInvoiceRow[];
  unpriced: UnpricedFteAssignment[];
};

/**
 * Load + compute the Dedicated FTE pre-invoice rows for an account + month,
 * including coverage (backfill) adjustments. Self-contained (does its own
 * queries) so both the single FTE generator and the combined generator share
 * one source of truth.
 */
export async function loadFteRows(
  accountId: string,
  range: { start: Date; end: Date },
): Promise<FteRowsResult> {
  const account = await prisma.clientAccount.findUnique({
    where: { id: accountId },
    select: {
      defaultHours: true,
      accountRates: { include: { rateSubCategory: true, sla: true } },
    },
  });
  if (!account) return { rows: [], unpriced: [] };
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

  // PH days now bill as paid working days (see splitCell), so the informational
  // Business Days reference is simply the weekday count for the month.
  const businessDays = businessDaysInRange(range, []);

  // Resolve { dayRate, ot, weekend } for an assignment. The dedicated base is an
  // hourly rate; day rate = hourly x account defaultHours, billed per day worked
  // (= hourly x regular hours). Rebadged derives its hourly from salary / 2080.
  // OT and weekend are always per-hour from the sheet (rebadged uses its own).
  type AssignmentWithTech = (typeof assignments)[number];
  function resolveRates(a: AssignmentWithTech) {
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

    // Day rate = the technician's annual salary spread over the month's business
    // days (annual / 12 / businessDays), so a fully-worked month bills exactly
    // annual / 12. Per-tech annual wins; otherwise fall back to the band rate row
    // (stored hourly -> implied annual via x 2080).
    const perTechAnnual = Number(a.technician.annualSalary ?? 0);
    const bandAnnual = annualFromBandHourly(Number(dayRateRow?.rateAmount?.toString() ?? 0));
    const annual = perTechAnnual > 0 ? perTechAnnual : bandAnnual;
    const dayRate = new Prisma.Decimal(dedicatedDayRate(annual, businessDays));

    // OT / weekend: rebadged techs use their own manual hourly rates; everyone
    // else uses the band rate sheet.
    if (a.technician.isRebadged) {
      return {
        dayRate,
        ot: new Prisma.Decimal(a.technician.rebadgedOtRate?.toString() ?? "0"),
        weekend: new Prisma.Decimal(a.technician.rebadgedWeekendRate?.toString() ?? "0"),
      };
    }
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
      dayRate,
      ot: new Prisma.Decimal(otRow?.rateAmount?.toString() ?? 0),
      weekend: new Prisma.Decimal(weekendRow?.rateAmount?.toString() ?? 0),
    };
  }

  const assignmentIds = assignments.map((a) => a.id);
  // Coverage (backfill) validity is governed per event by the covered technician's
  // tier (BACKFILL) in the calculator, so load all coverage rows for the period.
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
  const unpriced: UnpricedFteAssignment[] = [];
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

    const extendedTotalNum = Number(calc.extendedTotal.toFixed(2));
    if (extendedTotalNum === 0) {
      // Worked days but the resolved total is 0 -> no active rate row. Flag for
      // review rather than emitting a silent $0 line.
      unpriced.push({
        assignmentId: a.id,
        technicianName: `${a.technician.firstName} ${a.technician.lastName}`,
        band: a.technician.band,
        backfillLabel: slaTierLabel(a.slaTier),
        daysWorked: daysWorkedNum,
      });
      continue;
    }

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
      extendedTotal: extendedTotalNum,
      remarks: remarkParts.length > 0 ? remarkParts.join(" · ") : undefined,
    });
  }

  return { rows, unpriced };
}
