import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { notDeleted } from "@/lib/domain/soft-delete";
import { calculateDispatchVisit, type DispatchRateRow } from "./dispatch-calculator";
import { profileFor } from "./dispatch-pricing-profiles";
import { isBillableStatus } from "./dispatch-status";
import type { DispatchTrackerRow } from "./render-dispatch";

type AccountRateLike = {
  rateAmount: Prisma.Decimal | null;
  band: number;
  rateSubCategory: { code: string; rateCategory: string };
  sla: { code: string };
};

/** DISPATCH_SCHED rate rows for the calculator. */
export function dispatchRateRows(accountRates: AccountRateLike[]): DispatchRateRow[] {
  return accountRates
    .filter((r) => r.rateSubCategory.rateCategory === "DISPATCH_SCHED")
    .map((r) => ({
      rateAmount: r.rateAmount,
      band: r.band,
      rateSubCategory: { code: r.rateSubCategory.code },
      sla: { code: r.sla.code },
    }));
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function isWeekendDate(d: Date): boolean {
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}
function hhmm(d: Date): string {
  return d.toLocaleString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    hour12: false,
  });
}

/**
 * Load the month's dispatch visits for an account and resolve them to tracker rows.
 * `pricingModel` selects the dispatch profile (defaults to STANDARD, the original
 * band + SLA math, so every existing caller is unchanged).
 */
export async function loadDispatchTrackerRows(
  accountId: string,
  range: { start: Date; end: Date },
  rateRows: DispatchRateRow[],
  pricingModel?: string | null,
  businessWindow?: { start: string; end: string } | null,
): Promise<DispatchTrackerRow[]> {
  const profile = profileFor(pricingModel);
  const [visits, holidays] = await Promise.all([
    prisma.dispatchVisit.findMany({
      where: {
        ...notDeleted,
        visitDate: { gte: range.start, lt: range.end },
        assignment: { clientAccountId: accountId },
      },
      include: {
        sla: true,
        postalCode: true,
        assignment: { include: { technician: { include: { postalCode: true } } } },
      },
      orderBy: [{ visitDate: "asc" }],
    }),
    prisma.holiday.findMany({
      where: { date: { gte: range.start, lt: range.end } },
      select: { date: true },
    }),
  ]);

  // Public-holiday dates drive the weekend/PH uplift (2.0x). Weekend is the visit's
  // manual flag OR a Saturday/Sunday visit date.
  const holidaySet = new Set(holidays.map((h) => isoDate(h.date)));

  return visits.map((v) => {
    const tech = v.assignment.technician;
    // Calendar weekend / holiday only count when the profile opts in (JLL yes,
    // TCS no — TCS bills weekends from its explicit flag).
    const isPublicHoliday =
      profile.autoWeekendFromDate && holidaySet.has(isoDate(v.visitDate));
    const calc = calculateDispatchVisit(
      {
        id: v.id,
        visitDate: v.visitDate,
        ticketNumber: v.ticketNumber,
        hoursOnSite: new Prisma.Decimal(v.hoursOnSite.toString()),
        afterHours: v.afterHours,
        weekend: v.weekend || (profile.autoWeekendFromDate && isWeekendDate(v.visitDate)),
        isPublicHoliday,
        slaCode: v.sla.code,
        technicianName: `${tech.firstName} ${tech.lastName}`,
        technicianBand: tech.band,
        location: "",
        notes: v.notes,
        inTime: v.startDateTime ? hhmm(v.startDateTime) : null,
        outTime: v.endDateTime ? hhmm(v.endDateTime) : null,
        businessWindow: businessWindow ?? null,
        oooHrs: v.oooHrs ? Number(v.oooHrs.toString()) : null,
      },
      rateRows,
      profile,
    );
    const pc = v.postalCode ?? tech.postalCode;
    // COMPLETED bills its computed charge. A CANCELLED visit bills ONLY its
    // manual cancellationCharge (user rule 2026-06-13): no charge entered ->
    // logged in the tracker at $0, never on the pre-invoice.
    const cancellationCharge =
      v.workStatus === "CANCELLED" && v.cancellationCharge != null
        ? Number(v.cancellationCharge.toString())
        : null;
    const billed = isBillableStatus(v.workStatus)
      ? calc.charge
      : cancellationCharge ?? 0;
    const total = calc.hoursOnSite;
    return {
      visitId: v.id,
      firstHourRate: calc.firstHourRate,
      additionalHourRate: calc.additionalHourRate,
      requestReceivedDate: v.requestReceivedDate ? isoDate(v.requestReceivedDate) : null,
      visitDate: isoDate(v.visitDate),
      visitTime: v.visitTime,
      proposedOnsiteDate: v.proposedOnsiteDate ? isoDate(v.proposedOnsiteDate) : null,
      siteCode: v.siteCode,
      street: v.siteLocation,
      city: pc?.city ?? null,
      state: pc?.state ?? null,
      zip: pc?.zipcode ?? null,
      engineerName: `${tech.firstName} ${tech.lastName}`,
      engineerPhone: tech.phone,
      engineerEmail: tech.email,
      ticketNumber: v.ticketNumber,
      workStatus: v.workStatus,
      inTime: v.startDateTime ? hhmm(v.startDateTime) : null,
      outTime: v.endDateTime ? hhmm(v.endDateTime) : null,
      totalHrs: total,
      // Hours billed beyond the first-hour charge, per the profile (JLL: after 1h,
      // TCS: after 2h). Display only; the money is calc.charge.
      additionalHours: Math.max(0, Number((total - profile.freeHoursIncluded).toFixed(2))),
      oooHrs: v.oooHrs ? Number(v.oooHrs.toString()) : null,
      cancellationCharge,
      billed,
      band: tech.band,
      slaCode: v.sla.code,
    };
  });
}
