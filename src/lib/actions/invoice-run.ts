"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/dev-session";
import type { ActionResult } from "./result";

/**
 * Hard-delete an InvoiceRun audit record. Runs carry no stored file (fileUrl is
 * null at launch) and nothing references them, so a plain delete is safe. This is
 * the escape hatch for clearing the run history that otherwise blocks an account
 * delete during testing.
 */
export async function deleteInvoiceRun(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, formError: "Missing invoice run id." };
  try {
    const run = await prisma.invoiceRun.delete({
      where: { id },
      select: { clientAccountId: true },
    });
    revalidatePath(`/admin/accounts/${run.clientAccountId}`);
    revalidatePath(`/admin/invoices/generate/${run.clientAccountId}`);
    revalidatePath("/admin/invoices");
    return { ok: true, message: "Invoice run deleted." };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return { ok: false, formError: "Invoice run not found." };
    }
    throw err;
  }
}
