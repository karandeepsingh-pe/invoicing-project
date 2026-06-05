"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/dev-session";
import { dispatchRateRows } from "@/lib/invoice/dispatch-rows";
import { profileFor } from "@/lib/invoice/dispatch-pricing-profiles";
import { calculateDispatchVisit } from "@/lib/invoice/dispatch-calculator";

// Live charge preview for the dispatch visit form. Read-only: it loads the
// account's dispatch rates + pricing profile + business-hours window and runs the
// SAME calculator the tracker/pre-invoice use, so the preview equals the eventual
// bill. No billing math is duplicated here.

export type DispatchPreviewInput = {
  accountId: string;
  assignmentId: string;
  slaId: string;
  hoursOnSite: number;
  visitDate: string; // "YYYY-MM-DD"
  inTime?: string | null; // "HH:mm"
  outTime?: string | null; // "HH:mm"
  oooHrs?: number | null;
  afterHours: boolean;
  weekend: boolean;
};

export type DispatchPreviewResult =
  | {
      ok: true;
      charge: number;
      firstHourRate: number;
      additionalHourRate: number;
      billableHrs: number;
      additionalHours: number;
      modifiers: string[];
      hasRate: boolean;
    }
  | { ok: false; error: string };

function isWeekendDate(iso: string): boolean {
  const day = new Date(`${iso}T00:00:00.000Z`).getUTCDay();
  return day === 0 || day === 6;
}

export async function previewDispatchCharge(
  input: DispatchPreviewInput,
): Promise<DispatchPreviewResult> {
  await requireAdmin();

  if (!input.accountId || !input.assignmentId || !input.slaId) {
    return { ok: false, error: "Pick a technician and SLA to preview." };
  }
  const hours = Number(input.hoursOnSite);
  if (!Number.isFinite(hours) || hours < 0) return { ok: false, error: "Enter valid hours." };

  const [account, assignment, sla] = await Promise.all([
    prisma.clientAccount.findUnique({
      where: { id: input.accountId },
      include: { accountRates: { include: { rateSubCategory: true, sla: true } } },
    }),
    prisma.assignment.findUnique({
      where: { id: input.assignmentId },
      include: { technician: true },
    }),
    prisma.sla.findUnique({ where: { id: input.slaId } }),
  ]);
  if (!account || !assignment || !sla) {
    return { ok: false, error: "Account, technician, or SLA not found." };
  }

  const profile = profileFor(account.dispatchPricingModel);
  const businessWindow =
    account.businessHoursStart && account.businessHoursEnd
      ? { start: account.businessHoursStart, end: account.businessHoursEnd }
      : null;

  // Mirror the tracker's weekend/holiday derivation (dispatch-rows.ts).
  let isPublicHoliday = false;
  if (profile.autoWeekendFromDate && input.visitDate) {
    const h = await prisma.holiday.findFirst({
      where: { date: new Date(`${input.visitDate}T00:00:00.000Z`) },
      select: { id: true },
    });
    isPublicHoliday = h != null;
  }
  const weekend =
    input.weekend || (profile.autoWeekendFromDate && isWeekendDate(input.visitDate));

  const calc = calculateDispatchVisit(
    {
      id: "preview",
      visitDate: new Date(`${input.visitDate || "2000-01-01"}T00:00:00.000Z`),
      ticketNumber: null,
      hoursOnSite: new Prisma.Decimal(hours.toString()),
      afterHours: input.afterHours,
      weekend,
      isPublicHoliday,
      slaCode: sla.code,
      technicianName: `${assignment.technician.firstName} ${assignment.technician.lastName}`,
      technicianBand: assignment.technician.band,
      location: "",
      notes: null,
      inTime: input.inTime ?? null,
      outTime: input.outTime ?? null,
      businessWindow,
      oooHrs: input.oooHrs ?? null,
    },
    dispatchRateRows(account.accountRates),
    profile,
  );

  const additionalHours = Math.max(
    0,
    Number((calc.hoursOnSite - profile.freeHoursIncluded).toFixed(2)),
  );
  const hasRate = calc.firstHourRate > 0 || calc.additionalHourRate > 0 || calc.charge > 0;

  return {
    ok: true,
    charge: calc.charge,
    firstHourRate: calc.firstHourRate,
    additionalHourRate: calc.additionalHourRate,
    billableHrs: calc.hoursOnSite,
    additionalHours,
    modifiers: calc.modifiersApplied,
    hasRate,
  };
}
