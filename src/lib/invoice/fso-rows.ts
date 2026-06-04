// FSO (HCL) row loaders. One per billing sheet. These REUSE the validated
// Pre-Invoice billing (loadFteRows / loadProjectRows) plus a granular per-tech
// location map, and re-query Scheduled (per worked day) and Dispatch (per visit)
// with the pure calculators to get the full-day/half-day and first/additional
// breakdowns the FSO sheets need. No money is recomputed in a new way.

import { prisma } from "@/lib/db";
import { notDeleted } from "@/lib/domain/soft-delete";
import { businessDaysInRange } from "@/lib/invoice/period";
import { loadFteRows } from "./fte-rows";
import { loadProjectRows } from "./project-rows";
import { calculateDispatchVisit } from "./dispatch-calculator";
import { dispatchRateRows } from "./dispatch-rows";
import { Prisma } from "@prisma/client";

type Range = { start: Date; end: Date };

export type FsoLocation = {
  country: string;
  state: string;
  city: string;
  street: string;
  zip: string;
  phone: string;
  email: string;
};

export type FsoDedicatedRow = FsoLocation & {
  technicianName: string;
  band: string;
  variant: string;
  workingDays: number;
  workedDays: number;
  monthlyRate: number;
  actualCost: number;
  otHours: number;
  otRate: number;
  otCost: number;
  weekendHours: number;
  weekendRate: number;
  weekendCost: number;
  remarks: string;
};

export type FsoProjectRow = FsoDedicatedRow;

export type FsoScheduledRow = FsoLocation & {
  technicianName: string;
  visitDate: string;
  category: "Full Day" | "Half Day";
  halfDayRate: number;
  fullDayRate: number;
  totalCost: number;
};

export type FsoDispatchRow = FsoLocation & {
  technicianName: string;
  ticketNumber: string;
  slaCode: string;
  visitDate: string;
  totalHours: number;
  firstHourRate: number;
  firstHourCost: number;
  additionalHours: number;
  additionalHourRate: number;
  additionalHourCost: number;
  charge: number;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function variantOf(backfillLabel: string): string {
  if (backfillLabel === "Backfill") return "With Backfill";
  if (backfillLabel === "No Backfill") return "Without Backfill";
  return "";
}

const EMPTY_LOC: FsoLocation = {
  country: "",
  state: "",
  city: "",
  street: "",
  zip: "",
  phone: "",
  email: "",
};

/** Per-technician granular location for an account's assignments overlapping the month. */
async function techLocationMap(accountId: string, range: Range): Promise<Map<string, FsoLocation>> {
  const assignments = await prisma.assignment.findMany({
    where: {
      clientAccountId: accountId,
      startDate: { lt: range.end },
      OR: [{ endDate: null }, { endDate: { gte: range.start } }],
    },
    include: { technician: { include: { postalCode: true } } },
  });
  const map = new Map<string, FsoLocation>();
  for (const a of assignments) {
    const t = a.technician;
    map.set(`${t.firstName} ${t.lastName}`, {
      country: t.postalCode?.country ?? "",
      state: t.postalCode?.state ?? "",
      city: t.postalCode?.city ?? "",
      zip: t.postalCode?.zipcode ?? "",
      street: t.addressLine1 ?? "",
      phone: t.phone ?? "",
      email: t.email ?? "",
    });
  }
  return map;
}

export async function loadFsoDedicatedRows(accountId: string, range: Range): Promise<FsoDedicatedRow[]> {
  const [{ rows }, loc] = await Promise.all([loadFteRows(accountId, range), techLocationMap(accountId, range)]);
  return rows.map((r) => ({
    ...(loc.get(r.technicianName) ?? EMPTY_LOC),
    technicianName: r.technicianName,
    band: r.bandLabel,
    variant: variantOf(r.backfillLabel),
    workingDays: r.businessDays,
    workedDays: r.daysWorked,
    monthlyRate: round2(r.dayRate * r.businessDays),
    actualCost: r.extendedTotal,
    otHours: r.otHours,
    otRate: r.otRate,
    otCost: round2(r.otHours * r.otRate),
    weekendHours: r.weekendHours,
    weekendRate: r.weekendRate,
    weekendCost: round2(r.weekendHours * r.weekendRate),
    remarks: r.remarks ?? "",
  }));
}

export async function loadFsoProjectRows(accountId: string, range: Range): Promise<FsoProjectRow[]> {
  const [rows, loc] = await Promise.all([loadProjectRows(accountId, range), techLocationMap(accountId, range)]);
  const businessDays = businessDaysInRange(range, []);
  return rows.map((r) => ({
    ...(loc.get(r.technicianName) ?? EMPTY_LOC),
    technicianName: r.technicianName,
    band: r.bandLabel,
    variant: "",
    workingDays: businessDays,
    workedDays: r.daysWorked,
    monthlyRate: r.flat ? r.extendedTotal : round2(r.dayRate * businessDays),
    actualCost: r.extendedTotal,
    otHours: 0,
    otRate: 0,
    otCost: 0,
    weekendHours: 0,
    weekendRate: 0,
    weekendCost: 0,
    remarks: r.remarks ?? "",
  }));
}

export async function loadFsoScheduledRows(accountId: string, range: Range): Promise<FsoScheduledRow[]> {
  const account = await prisma.clientAccount.findUnique({
    where: { id: accountId },
    select: { defaultHours: true, accountRates: { include: { rateSubCategory: true, sla: true } } },
  });
  if (!account) return [];
  const assignments = await prisma.assignment.findMany({
    where: {
      clientAccountId: accountId,
      rateCategory: "SCHEDULED",
      startDate: { lt: range.end },
      OR: [{ endDate: null }, { endDate: { gte: range.start } }],
    },
    include: {
      technician: { include: { postalCode: true } },
      timesheetEntries: { where: { ...notDeleted, date: { gte: range.start, lt: range.end } }, orderBy: { date: "asc" } },
    },
    orderBy: [{ technician: { lastName: "asc" } }, { technician: { firstName: "asc" } }],
  });
  const pickRate = (band: number, code: string): number => {
    const row = account.accountRates.find(
      (r) => r.band === band && r.rateSubCategory.rateCategory === "SCHEDULED" && r.rateSubCategory.code === code,
    );
    return row?.rateAmount ? Number(row.rateAmount.toString()) : 0;
  };
  const out: FsoScheduledRow[] = [];
  for (const a of assignments) {
    const t = a.technician;
    const fullRate = pickRate(t.band, "FULL_DAY");
    const halfRate = pickRate(t.band, "HALF_DAY");
    const loc: FsoLocation = {
      country: t.postalCode?.country ?? "",
      state: t.postalCode?.state ?? "",
      city: t.postalCode?.city ?? "",
      zip: t.postalCode?.zipcode ?? "",
      street: t.addressLine1 ?? "",
      phone: t.phone ?? "",
      email: t.email ?? "",
    };
    for (const e of a.timesheetEntries) {
      let kind: "Full Day" | "Half Day" | null = null;
      if (e.status === "HALF_DAY") kind = "Half Day";
      else if (e.status === null) {
        const h = Number(e.hours.toString());
        if (h >= account.defaultHours) kind = "Full Day";
        else if (h > 0) kind = "Half Day";
      }
      if (!kind) continue;
      out.push({
        ...loc,
        technicianName: `${t.firstName} ${t.lastName}`,
        visitDate: e.date.toISOString().slice(0, 10),
        category: kind,
        halfDayRate: halfRate,
        fullDayRate: fullRate,
        totalCost: kind === "Full Day" ? fullRate : halfRate,
      });
    }
  }
  return out;
}

export async function loadFsoDispatchRows(accountId: string, range: Range): Promise<FsoDispatchRow[]> {
  const account = await prisma.clientAccount.findUnique({
    where: { id: accountId },
    select: { accountRates: { include: { rateSubCategory: true, sla: true } } },
  });
  if (!account) return [];
  const rateRows = dispatchRateRows(account.accountRates);

  const visits = await prisma.dispatchVisit.findMany({
    where: { ...notDeleted, visitDate: { gte: range.start, lt: range.end }, assignment: { clientAccountId: accountId } },
    include: {
      sla: true,
      postalCode: true,
      assignment: { include: { technician: { include: { postalCode: true } } } },
    },
    orderBy: { visitDate: "asc" },
  });

  const out: FsoDispatchRow[] = [];
  for (const v of visits) {
    const tech = v.assignment.technician;
    const pc = v.postalCode ?? tech.postalCode;
    const calc = calculateDispatchVisit(
      {
        id: v.id,
        visitDate: v.visitDate,
        ticketNumber: v.ticketNumber,
        hoursOnSite: new Prisma.Decimal(v.hoursOnSite.toString()),
        afterHours: v.afterHours,
        weekend: v.weekend,
        isPublicHoliday: false,
        slaCode: v.sla.code,
        technicianName: `${tech.firstName} ${tech.lastName}`,
        technicianBand: tech.band,
        location: "",
        notes: v.notes,
      },
      rateRows,
    );
    const hours = Number(v.hoursOnSite.toString());
    const additionalHours = Math.max(0, round2(hours - 1));
    const firstHourCost = Math.min(calc.charge, calc.firstHourRate);
    out.push({
      country: pc?.country ?? "",
      state: pc?.state ?? "",
      city: pc?.city ?? "",
      zip: pc?.zipcode ?? "",
      street: v.siteLocation ?? "",
      phone: tech.phone ?? "",
      email: tech.email ?? "",
      technicianName: `${tech.firstName} ${tech.lastName}`,
      ticketNumber: v.ticketNumber ?? "",
      slaCode: v.sla.code,
      visitDate: v.visitDate.toISOString().slice(0, 10),
      totalHours: hours,
      firstHourRate: calc.firstHourRate,
      firstHourCost,
      additionalHours,
      additionalHourRate: calc.additionalHourRate,
      additionalHourCost: round2(calc.charge - firstHourCost),
      charge: calc.charge,
    });
  }
  return out;
}
