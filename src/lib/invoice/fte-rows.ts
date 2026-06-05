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
import { pickBandAnnual, resolveDedicatedDayRate, resolveRebadgedDayRate } from "./billing-basis";
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

  // Resolve { dayRate, ot, weekend } for an assignment. The dedicated day rate is
  // an annual salary spread over the month's business days (annual / 12 /
  // businessDays), so a fully-worked month bills exactly annual / 12. OT and
  // weekend are always per-hour from the sheet (rebadged uses its own).
  type AssignmentWithTech = (typeof assignments)[number];
  function resolveRates(a: AssignmentWithTech) {
    // HOURLY (per-tech): regular HOURS × the band's Hourly Rate; DAY_RATE: regular
    // DAYS × the day rate. OT + weekend stay per-hour either way.
    const isHourly = a.technician.dedicatedBillingBasis === "HOURLY";
    const techRates = ratesForTechnicianInRange(
      accountRates,
      "DEDICATED",
      a.technician.band,
      range.start,
      range.end,
    );
    // Band salary source: prefer the exact annual (ANNUAL_RATE row); fall back to
    // a legacy hourly day-rate row (MONTHLY_DAY_RATE / ANNUAL_BACKFILL, = annual /
    // 2080) so accounts set up before the annual-storage change still price.
    const annualRow = techRates.find(
      (r) => r.rateSubCategory.code === "ANNUAL_RATE" && r.sla.code === a.slaTier,
    );
    const hourlyRow = techRates.find(
      (r) =>
        (r.rateSubCategory.code === "MONTHLY_DAY_RATE" ||
          r.rateSubCategory.code === "ANNUAL_BACKFILL") &&
        r.sla.code === a.slaTier,
    );
    // Newer explicit basis rows: a direct per-day DAY_RATE or a MONTHLY rate.
    const dayRow = techRates.find(
      (r) => r.rateSubCategory.code === "DAY_RATE" && r.sla.code === a.slaTier,
    );
    const monthlyRow = techRates.find(
      (r) => r.rateSubCategory.code === "MONTHLY" && r.sla.code === a.slaTier,
    );

    // Per-tech annual overrides the band salary (within-band exceptions + rebadged
    // techs); otherwise the band rate applies. Basis priority (see
    // resolveDedicatedDayRate): per-tech salary > DAY_RATE > ANNUAL_RATE/legacy > MONTHLY.
    const perTechAnnual = Number(a.technician.annualSalary ?? 0);
    const bandAnnual = pickBandAnnual(
      Number(annualRow?.rateAmount?.toString() ?? 0),
      Number(hourlyRow?.rateAmount?.toString() ?? 0),
    );
    // HOURLY basis: the regular rate is the per-hour HOURLY row (billed × regular
    // hours by the calculator). DAY_RATE: resolve a per-day rate from the basis rows.
    const hourlyBasisRow = techRates.find(
      (r) => r.rateSubCategory.code === "HOURLY" && r.sla.code === a.slaTier,
    );
    const dayRate = isHourly
      ? new Prisma.Decimal(Number(hourlyBasisRow?.rateAmount?.toString() ?? 0))
      : new Prisma.Decimal(
          resolveDedicatedDayRate({
            perTechAnnual,
            explicitDayRate: Number(dayRow?.rateAmount?.toString() ?? 0),
            bandAnnual,
            monthly: Number(monthlyRow?.rateAmount?.toString() ?? 0),
            businessDays,
          }),
        );

    // Rebadged techs bill entirely off their OWN per-tech rates (day rate from the
    // rebadged Day / Monthly / Annual / Hourly fields, in that priority; OT / weekend
    // from the manual rebadged hourly rates). The account band rate sheet is ignored.
    if (a.technician.isRebadged) {
      // HOURLY basis: bill the rebadged per-hour rate × regular hours directly.
      const rebadgedDay = isHourly
        ? new Prisma.Decimal(a.technician.rebadgedHourlyRate?.toString() ?? "0")
        : new Prisma.Decimal(
            resolveRebadgedDayRate({
              dayRate: Number(a.technician.rebadgedDayRate?.toString() ?? 0),
              monthlyRate: Number(a.technician.rebadgedMonthlyRate?.toString() ?? 0),
              annual: Number(a.technician.annualSalary ?? 0),
              hourlyRate: Number(a.technician.rebadgedHourlyRate?.toString() ?? 0),
              defaultHours,
              businessDays,
            }),
          );
      return {
        dayRate: rebadgedDay,
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
      basis: a.technician.dedicatedBillingBasis,
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
    if (a.technician.dedicatedBillingBasis === "HOURLY") {
      remarkParts.push(`Hourly basis: ${daysWorkedNum.toFixed(2)}h @ $${Number(calc.dayRate.toFixed(2))}/hr`);
    }
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
