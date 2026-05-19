"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/dev-session";
import { clientAccountCreateSchema } from "@/lib/schemas/client-account";
import type { ActionResult } from "./result";

export async function createClientAccount(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  const parsed = clientAccountCreateSchema.safeParse({
    orgId: formData.get("orgId"),
    name: formData.get("name"),
    currency: formData.get("currency") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  try {
    const account = await prisma.clientAccount.create({ data: parsed.data });
    revalidatePath(`/admin/orgs/${parsed.data.orgId}`);
    revalidatePath(`/admin/accounts/${account.id}`);
    return { ok: true, id: account.id };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return {
        ok: false,
        fieldErrors: { name: ["An account with this name already exists under this org"] },
      };
    }
    throw err;
  }
}
