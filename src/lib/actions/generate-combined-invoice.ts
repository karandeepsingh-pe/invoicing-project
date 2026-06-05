"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/dev-session";
import { z } from "zod";
import { monthRange, lastDayOfMonth, businessDaysInRange } from "@/lib/invoice/period";
import { loadFteRows } from "@/lib/invoice/fte-rows";
import { loadProjectRows } from "@/lib/invoice/project-rows";
import { loadScheduledRows } from "@/lib/invoice/scheduled-rows";
import { dispatchRateRows, loadDispatchTrackerRows } from "@/lib/invoice/dispatch-rows";
import { renderCombinedInvoice } from "@/lib/invoice/render-combined-invoice";
import { assembleInvoice, type FeeSpec } from "@/lib/invoice/assemble";
import type { PreInvoiceRow } from "@/lib/invoice/render-pre-invoice";

const schema = z.object({
  accountId: z.string().min(1),
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

type Success = { ok: true; filename: string; base64: string };
type Failure = { ok: false; formError?: string };
export type GenerateCombinedResult = Success | Failure | null;

function fmtDmy(d: Date): string {
  const day = d.getUTCDate();
  const month = d.toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  const year = d.getUTCFullYear();
  const suffix =
    day % 10 === 1 && day !== 11 ? "st"
      : day % 10 === 2 && day !== 12 ? "nd"
      : day % 10 === 3 && day !== 13 ? "rd"
      : "th";
  return `${day}${suffix} ${month} ${year}`;
}
function fmtIsoDate(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

export async function generateCombinedInvoice(
  _prev: GenerateCombinedResult,
  formData: FormData,
): Promise<GenerateCombinedResult> {
  const admin = await requireAdmin();

  let payload: unknown;
  try {
    payload = JSON.parse(String(formData.get("payload") ?? ""));
  } catch {
    return { ok: false, formError: "Invalid payload." };
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) return { ok: false, formError: "Validation failed." };
  const { accountId, year, month } = parsed.data;

  const account = await prisma.clientAccount.findUnique({
    where: { id: accountId },
    include: {
      org: true,
      miscFees: true,
      accountRates: { include: { rateSubCategory: true, sla: true } },
    },
  });
  if (!account) return { ok: false, formError: "Account not found." };

  const range = monthRange(year, month);
  const lastDay = lastDayOfMonth(year, month);
  const businessDays = businessDaysInRange(range, []);
  const businessWindow =
    account.businessHoursStart && account.businessHoursEnd
      ? { start: account.businessHoursStart, end: account.businessHoursEnd }
      : null;

  const [fteResult, projectRows, scheduledRows, dispatchDetail] = await Promise.all([
    loadFteRows(accountId, range),
    loadProjectRows(accountId, range),
    loadScheduledRows(accountId, range),
    loadDispatchTrackerRows(
      accountId,
      range,
      dispatchRateRows(account.accountRates),
      account.dispatchPricingModel,
      businessWindow,
    ),
  ]);

  // Merge every engagement type into ONE unified line-item table, in the order the
  // reference sheet uses: FTE, then Project, then Scheduled, then Dispatch (one row
  // per billable visit). FTE rows are already PreInvoiceRow-shaped; the rest map in.
  const fteRows = fteResult.rows;
  const projectAsRows: PreInvoiceRow[] = projectRows.map((r) => ({
    location: r.location,
    technicianName: r.technicianName,
    bandLabel: r.bandLabel,
    backfillLabel: "",
    engineerType: "Project",
    businessDays,
    daysWorked: r.daysWorked,
    dayRate: r.flat ? 0 : r.dayRate, // flat (Weekly/Monthly/capped) rows show the flat amount, no per-day rate
    otHours: 0,
    otRate: 0,
    weekendHours: 0,
    weekendRate: 0,
    extendedTotal: r.extendedTotal,
    literalExtended: r.flat,
    remarks: r.remarks,
  }));
  const dispatchAsRows: PreInvoiceRow[] = dispatchDetail
    .filter((d) => d.billed > 0)
    .map((d) => ({
      location: [d.city, d.state].filter(Boolean).join(", ") || d.street || "—",
      technicianName: d.engineerName,
      bandLabel: `Band ${d.band}`,
      backfillLabel: "",
      engineerType: "Dispatch",
      businessDays: 0,
      daysWorked: 1,
      dayRate: d.billed, // per-visit charge; Extended = dayRate × 1
      otHours: 0,
      otRate: 0,
      weekendHours: 0,
      weekendRate: 0,
      extendedTotal: d.billed,
      remarks: [d.ticketNumber, d.slaCode].filter(Boolean).join(" · ") || undefined,
    }));

  const rows: PreInvoiceRow[] = [
    ...fteRows,
    ...projectAsRows,
    ...scheduledRows,
    ...dispatchAsRows,
  ];

  // Add-on fees, identical to the single-type generator: percentage fees (e.g. the
  // 3% PM fee) on the line-item subtotal, plus flat retainer + reimbursements.
  const percentFees: FeeSpec[] = account.miscFees
    .filter((m) => m.percent != null)
    .map((m) => ({ kind: "percent", label: m.label, percent: Number(m.percent ?? 0) }));
  const retainerFee = account.miscFees
    .filter((m) => m.percent == null && m.kind === "RETAINER_FEES")
    .reduce((n, m) => n + Number(m.amount?.toString() ?? 0), 0);
  const reimbursements = account.miscFees
    .filter((m) => m.percent == null && m.kind !== "RETAINER_FEES")
    .reduce((n, m) => n + Number(m.amount?.toString() ?? 0), 0);

  const assembled = assembleInvoice(
    rows.map((r) => r.extendedTotal),
    [
      ...percentFees,
      { kind: "flat", label: "Retainer", amount: retainerFee },
      { kind: "flat", label: "Reimbursements", amount: reimbursements },
    ],
  );
  const pmFees = assembled.appliedFees.filter((f) => f.kind === "percent");
  const pmFeeAmount = pmFees.reduce((n, f) => n + f.amount, 0);
  const projectManagementFee =
    pmFeeAmount > 0
      ? {
          label:
            pmFees.length === 1 && pmFees[0].percent != null
              ? `Project Management Fee (${pmFees[0].percent}%)`
              : "Project Management Fee",
          amount: pmFeeAmount,
        }
      : undefined;

  const monthLabel = range.start.toLocaleString("en-US", { month: "short", timeZone: "UTC" });

  const buffer = await renderCombinedInvoice(
    {
      timePeriod: `${fmtIsoDate(range.start)} - ${fmtIsoDate(lastDay)}`,
      clientName: account.org.name,
      accountName: account.name,
      clientPocName: account.clientPocName ?? "",
      clientSpocEmail: account.clientSpocEmail ?? "",
      projectDescription: account.projectDescription ?? "Combined Support",
      poNumber: "",
      ovationPocName: admin.name ?? "",
      ovationPocEmail: admin.email,
      dateOfPreApproval: fmtDmy(new Date()),
      monthYearLabel: `${monthLabel} ${year}`,
    },
    rows,
    dispatchDetail,
    { retainerFee, reimbursements, projectManagementFee },
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

  const filename = `${account.org.name}_${account.name}_Combined_Pre-Invoice_${monthLabel}_${year}.xlsx`;
  return { ok: true, filename, base64: buffer.toString("base64") };
}
