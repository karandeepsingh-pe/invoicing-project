"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/dev-session";
import { generatePreInvoiceSchema } from "@/lib/schemas/generate-pre-invoice";
import { lastDayOfMonth, monthRange } from "@/lib/invoice/period";
import { renderPreInvoice } from "@/lib/invoice/render-pre-invoice";
import { loadFteRows } from "@/lib/invoice/fte-rows";
import { assembleInvoice, type FeeSpec } from "@/lib/invoice/assemble";

type SuccessPayload = { ok: true; filename: string; base64: string };
type ErrorPayload = { ok: false; formError?: string };

export type GeneratePreInvoiceResult = SuccessPayload | ErrorPayload | null;

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

export async function generatePreInvoice(
  _prev: GeneratePreInvoiceResult,
  formData: FormData,
): Promise<GeneratePreInvoiceResult> {
  const admin = await requireAdmin();

  let payload: unknown;
  try {
    payload = JSON.parse(String(formData.get("payload") ?? ""));
  } catch {
    return { ok: false, formError: "Invalid payload." };
  }
  const parsed = generatePreInvoiceSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, formError: "Validation failed." };
  }
  const { accountId, year, month } = parsed.data;

  const account = await prisma.clientAccount.findUnique({
    where: { id: accountId },
    include: { org: true, miscFees: true },
  });
  if (!account) return { ok: false, formError: "Account not found." };

  const range = monthRange(year, month);
  const lastDay = lastDayOfMonth(year, month);

  const { rows } = await loadFteRows(accountId, range);

  // Add-ons: percentage fees (e.g. PM fee) computed on the line-item subtotal,
  // plus flat retainer and reimbursements. Authoritative totals via assembleInvoice.
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

  const buffer = await renderPreInvoice(
    {
      timePeriod: `${fmtIsoDate(range.start)} - ${fmtIsoDate(lastDay)}`,
      clientName: account.org.name,
      accountName: account.name,
      clientPocName: account.clientPocName ?? "",
      clientSpocEmail: account.clientSpocEmail ?? "",
      projectDescription: account.projectDescription ?? "FTE - Dedicated Support",
      poNumber: "",
      ovationPocName: admin.name ?? "",
      ovationPocEmail: admin.email,
      dateOfPreApproval: fmtDmy(new Date()),
      monthYearLabel: `${monthLabel} ${year}`,
    },
    rows,
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

  const filename = `${account.org.name}_${account.name}_Pre-Invoice_${monthLabel}_${year}.xlsx`;
  return { ok: true, filename, base64: buffer.toString("base64") };
}
