"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/dev-session";
import { monthRange } from "@/lib/invoice/period";
import {
  loadFsoDedicatedRows,
  loadFsoDispatchRows,
  loadFsoProjectRows,
  loadFsoScheduledRows,
} from "@/lib/invoice/fso-rows";
import { renderFsoWorkbook } from "@/lib/invoice/render-fso";
import { orgSupportsFso } from "@/lib/invoice/fso-eligibility";
import { appendInvoiceBundle } from "@/lib/invoice/append-bundle";

const schema = z.object({
  accountId: z.string().min(1),
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

type Success = { ok: true; filename: string; base64: string };
type Failure = { ok: false; formError?: string };
export type GenerateFsoResult = Success | Failure | null;

export async function generateFsoInvoice(
  _prev: GenerateFsoResult,
  formData: FormData,
): Promise<GenerateFsoResult> {
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
    include: { org: true },
  });
  if (!account) return { ok: false, formError: "Account not found." };
  // FSO is HCL-only: gate on the org being HCL (covers every HCL account,
  // existing or new, regardless of the org's stored output template).
  if (!orgSupportsFso(account.org)) {
    return { ok: false, formError: "FSO output is only available for accounts under HCL." };
  }

  const range = monthRange(year, month);
  const [dedicated, project, scheduled, dispatch] = await Promise.all([
    loadFsoDedicatedRows(accountId, range),
    loadFsoProjectRows(accountId, range),
    loadFsoScheduledRows(accountId, range),
    loadFsoDispatchRows(accountId, range),
  ]);

  const monthLabel = range.start.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const serviceMonth = `${monthLabel}-${String(range.start.getUTCFullYear()).slice(2)}`;

  // Grand total across the four FSO category sheets, for the Remittance Advice.
  const invoiceTotal =
    dedicated.reduce((n, r) => n + r.actualCost + r.otCost + r.weekendCost, 0) +
    project.reduce((n, r) => n + r.actualCost + r.otCost + r.weekendCost, 0) +
    dispatch.reduce((n, r) => n + r.charge, 0) +
    scheduled.reduce((n, r) => n + r.totalCost, 0);

  const buffer = await renderFsoWorkbook(
    {
      customerName: account.name,
      currency: account.currency ?? account.org.defaultCurrency,
      serviceMonth,
    },
    { dedicated, project, scheduled, dispatch },
    (wb) => appendInvoiceBundle(wb, { accountId, year, month, invoiceTotal }),
  );

  await prisma.invoiceRun.create({
    data: {
      clientAccountId: accountId,
      periodYear: year,
      periodMonth: month,
      format: "FSO",
      fileUrl: null,
      generatedById: admin.userId,
    },
  });

  revalidatePath(`/admin/invoices`);
  revalidatePath(`/admin/invoices/generate/${accountId}`);

  const filename = `${account.org.name}_${account.name}_FSO_${monthLabel}_${year}.xlsx`;
  return { ok: true, filename, base64: buffer.toString("base64") };
}
