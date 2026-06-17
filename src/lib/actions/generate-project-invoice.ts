"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { notDeleted } from "@/lib/domain/soft-delete";
import { requireAccountAccess, requireSession } from "@/lib/auth/session";
import { z } from "zod";
import { monthRange, lastDayOfMonth } from "@/lib/invoice/period";
import {
  calculateProjectRow,
  type ProjectRateRow,
  type ProjectTimesheetCell,
} from "@/lib/invoice/project-calculator";
import {
  renderProjectInvoice,
  type ProjectRow,
} from "@/lib/invoice/render-project";
import { appendInvoiceBundle } from "@/lib/invoice/append-bundle";

const schema = z.object({
  accountId: z.string().min(1),
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

type Success = { ok: true; filename: string; base64: string };
type Failure = { ok: false; formError?: string };
export type GenerateProjectResult = Success | Failure | null;

const DEFAULT_HOURS = 8;

function fmtDmy(d: Date): string {
  const day = d.getUTCDate();
  const month = d.toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  const year = d.getUTCFullYear();
  const suffix =
    day % 10 === 1 && day !== 11
      ? "st"
      : day % 10 === 2 && day !== 12
        ? "nd"
        : day % 10 === 3 && day !== 13
          ? "rd"
          : "th";
  return `${day}${suffix} ${month} ${year}`;
}

function fmtIsoDate(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

export async function generateProjectInvoice(
  _prev: GenerateProjectResult,
  formData: FormData,
): Promise<GenerateProjectResult> {
  const admin = await requireSession();

  let payload: unknown;
  try {
    payload = JSON.parse(String(formData.get("payload") ?? ""));
  } catch {
    return { ok: false, formError: "Invalid payload." };
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, formError: "Validation failed." };
  }
  const { accountId, year, month } = parsed.data;
  await requireAccountAccess(accountId);

  const account = await prisma.clientAccount.findUnique({
    where: { id: accountId },
    include: {
      org: true,
      accountRates: { include: { rateSubCategory: true, sla: true } },
      miscFees: true,
    },
  });
  if (!account) return { ok: false, formError: "Account not found." };

  const range = monthRange(year, month);
  const lastDay = lastDayOfMonth(year, month);

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
      { technician: { firstName: "asc" } },
      { technician: { lastName: "asc" } },
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

  const retainerFee = account.miscFees
    .filter((m) => m.kind === "RETAINER_FEES")
    .reduce((n, m) => n + Number(m.amount?.toString() ?? 0), 0);
  const reimbursements = account.miscFees
    .filter((m) => m.kind !== "RETAINER_FEES")
    .reduce((n, m) => n + Number(m.amount?.toString() ?? 0), 0);

  const monthLabel = range.start.toLocaleString("en-US", {
    month: "short",
    timeZone: "UTC",
  });

  const invoiceTotal =
    rows.reduce((n, r) => n + r.extendedTotal, 0) + retainerFee + reimbursements;

  const buffer = await renderProjectInvoice(
    {
      timePeriod: `${fmtIsoDate(range.start)} - ${fmtIsoDate(lastDay)}`,
      clientName: account.org.name,
      accountName: account.name,
      clientPocName: account.clientPocName ?? "",
      clientSpocEmail: account.clientSpocEmail ?? "",
      projectDescription: account.projectDescription ?? "Project / T&M",
      poNumber: "",
      ovationPocName: admin.name ?? "",
      ovationPocEmail: admin.email,
      dateOfPreApproval: fmtDmy(new Date()),
      monthYearLabel: `${monthLabel} ${year}`,
    },
    rows,
    { retainerFee, reimbursements },
    (wb) => appendInvoiceBundle(wb, { accountId, year, month, invoiceTotal }),
  );

  await prisma.invoiceRun.create({
    data: {
      clientAccountId: accountId,
      periodYear: year,
      periodMonth: month,
      format: "PRE_INVOICE",
      fileUrl: null,
      generatedById: admin.userId,
    },
  });

  revalidatePath(`/admin/invoices`);
  revalidatePath(`/admin/invoices/generate/${accountId}`);

  const filename = `${account.org.name}_${account.name}_Project_Pre-Invoice_${monthLabel}_${year}.xlsx`;
  return { ok: true, filename, base64: buffer.toString("base64") };
}
