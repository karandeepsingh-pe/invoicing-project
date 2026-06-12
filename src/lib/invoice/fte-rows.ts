import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { notDeleted } from "@/lib/domain/soft-delete";
import { businessDaysInRange } from "@/lib/invoice/period";
import { holidayDatesInRange } from "@/lib/domain/holidays";
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
  type CoveringTechInfo,
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
  /**
   * Pass-through backfill expenses for the period (travel etc. paid to covering
   * techs), billed dollar-for-dollar under the pre-invoice footer's
   * Reimbursements — NOT included in any row's extendedTotal.
   */
  coverageExpenses: number;
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
  if (!account) return { rows: [], unpriced: [], coverageExpenses: 0 };
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

  // Business days exclude public holidays, which is how the client pays for
  // PH: the day rate (annual / 12 / businessDays) rises so a full non-PH
  // month bills exactly the monthly. PH itself credits 0 worked days.
  const businessDays = businessDaysInRange(range, await holidayDatesInRange(range));

  // Resolve { dayRate, ot, weekend } for an assignment. ANNUAL is the only
  // billing basis: the salary spreads as annual / 12 / businessDays so a
  // fully-worked month bills exactly annual / 12 and partial months scale by
  // daysWorked. OT and weekend are always per-hour from the sheet (rebadged
  // uses its own).
  type AssignmentWithTech = (typeof assignments)[number];
  function resolveRates(a: AssignmentWithTech) {
    // Rebadged techs bill entirely off their OWN annual salary through the same
    // formula (full override — the account band sheet is ignored, including
    // OT / weekend, which come from the rebadged hourly rates). A rebadged tech
    // without an annual salary resolves to 0 and surfaces as unpriced.
    if (a.technician.isRebadged) {
      return {
        dayRate: new Prisma.Decimal(
          resolveRebadgedDayRate({
            annual: Number(a.technician.annualSalary ?? 0),
            businessDays,
          }),
        ),
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
    // Band salary source: prefer the exact annual (ANNUAL_RATE row); fall back to
    // a legacy hourly day-rate row (MONTHLY_DAY_RATE / ANNUAL_BACKFILL, = annual /
    // 2080) so accounts set up before the annual-storage change still price. The
    // retired DAY_RATE / MONTHLY / HOURLY basis rows are no longer read.
    const annualRow = techRates.find(
      (r) => r.rateSubCategory.code === "ANNUAL_RATE" && r.sla.code === a.slaTier,
    );
    const hourlyRow = techRates.find(
      (r) =>
        (r.rateSubCategory.code === "MONTHLY_DAY_RATE" ||
          r.rateSubCategory.code === "ANNUAL_BACKFILL") &&
        r.sla.code === a.slaTier,
    );

    // Per-tech annual overrides the band salary (within-band exceptions).
    const perTechAnnual = Number(a.technician.annualSalary ?? 0);
    const bandAnnual = pickBandAnnual(
      Number(annualRow?.rateAmount?.toString() ?? 0),
      Number(hourlyRow?.rateAmount?.toString() ?? 0),
    );
    const dayRate = new Prisma.Decimal(
      resolveDedicatedDayRate({ perTechAnnual, bandAnnual, businessDays }),
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
      dayRate,
      ot: new Prisma.Decimal(otRow?.rateAmount?.toString() ?? 0),
      weekend: new Prisma.Decimal(weekendRow?.rateAmount?.toString() ?? 0),
    };
  }

  const assignmentIds = assignments.map((a) => a.id);
  // Coverage (backfill) events for the period. The covering side is technician-
  // based: any active pool tech, no account assignment needed.
  const coverageRows = await prisma.coverageEvent.findMany({
    where: {
      ...notDeleted,
      date: { gte: range.start, lt: range.end },
      coveredAssignmentId: { in: assignmentIds },
    },
    include: {
      coveringTechnician: { include: { postalCode: true } },
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

  const coveringTechById = new Map<string, CoveringTechInfo>();
  for (const e of coverageRows) {
    const t = e.coveringTechnician;
    if (!t || coveringTechById.has(t.id)) continue;
    coveringTechById.set(t.id, {
      name: `${t.firstName} ${t.lastName}`,
      bandLabel: t.isRebadged ? "Rebadged" : `Band ${t.band}`,
      location: t.postalCode ? `${t.postalCode.city}, ${t.postalCode.state}` : "—",
    });
  }

  const coverageEvents: CoverageEventInput[] = coverageRows
    .filter((e) => e.coveringTechnicianId !== null)
    .map((e) => ({
      id: e.id,
      coveredAssignmentId: e.coveredAssignmentId,
      coveringTechnicianId: e.coveringTechnicianId as string,
      date: e.date,
      hours: e.hours,
      expenseAmount: e.expenseAmount,
      expenseNotes: e.expenseNotes,
    }));
  const coverage = applyCoverageEvents({
    events: coverageEvents,
    contextByAssignment,
    defaultHours,
    technicianNameByAssignment: techNameByAssignment,
    coveringTechById,
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

    // OT / weekend get their own line items on the pre-invoice (see
    // fte-line-items.ts), so no breakdown remark is needed here.
    const remarkParts: string[] = coverage.remarksByAssignment.get(a.id) ?? [];

    // PTO is paid to the technician but not billed to the client (0 billable
    // days). Surface the count so the lower day total is explained. PH is
    // invisible by design — billed via the business-day denominator, so no note.
    const ptoCount = a.timesheetEntries.filter((e) => e.status === "PTO").length;
    if (ptoCount > 0) remarkParts.push(`${ptoCount} PTO — paid, not billed`);

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

  // Synthesized backfill lines: one per (covering technician, covered seat),
  // billed at the COVERED seat's rates. Shows who covered, the dates, the
  // HOURS, and the amount — independent of any assignment the covering tech
  // may or may not hold on this account.
  for (const line of coverage.backfillLines) {
    const daysNum = Number(line.regularDays.toFixed(2));
    const otNum = Number(line.otHours.toFixed(2));
    const weekendNum = Number(line.weekendHours.toFixed(2));
    if (daysNum === 0 && otNum === 0 && weekendNum === 0) continue;

    const extended = Number(
      line.dayRate
        .times(line.regularDays)
        .plus(line.otRate.times(line.otHours))
        .plus(line.weekendRate.times(line.weekendHours))
        .toFixed(2),
    );

    const dateBits = line.perDate
      .map((d) => `${d.dateLabel}, ${Number(d.hours.toFixed(2)).toFixed(2)} hrs`)
      .join("; ");
    // OT / weekend split into their own line items downstream (fte-line-items.ts).
    const remarkParts = [`Backfill for ${line.coveredTechName} — ${dateBits}`];
    const expenseNum = Number(line.expenseTotal.toFixed(2));
    if (expenseNum > 0) {
      const noteBit = line.expenseNotes.length > 0 ? ` (${line.expenseNotes.join(", ")})` : "";
      remarkParts.push(`$${expenseNum.toFixed(2)} expenses${noteBit} → Reimbursements`);
    }

    rows.push({
      location: line.coveringLocation,
      technicianName: line.coveringTechName,
      bandLabel: line.coveringBandLabel,
      backfillLabel: line.coveredTierLabel, // the covered SEAT's tier
      engineerType: "FTE (Backfill)",
      businessDays,
      daysWorked: daysNum,
      dayRate: line.dayRate.toNumber(),
      otHours: otNum,
      otRate: Number(line.otRate.toFixed(2)),
      weekendHours: weekendNum,
      weekendRate: Number(line.weekendRate.toFixed(2)),
      extendedTotal: extended,
      remarks: remarkParts.join(" · "),
    });
  }

  const coverageExpenses = Number(
    coverage.backfillLines
      .reduce((sum, l) => sum.plus(l.expenseTotal), new Prisma.Decimal(0))
      .toFixed(2),
  );

  return { rows, unpriced, coverageExpenses };
}
