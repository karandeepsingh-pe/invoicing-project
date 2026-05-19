"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/dev-session";
import { technicianCreateSchema } from "@/lib/schemas/technician";
import type { ActionResult } from "./result";

export async function createTechnician(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  const parsed = technicianCreateSchema.safeParse({
    employerOrgId: formData.get("employerOrgId"),
    name: formData.get("name"),
    primaryType: formData.get("primaryType"),
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const tech = await prisma.technician.create({ data: parsed.data });
  revalidatePath("/admin/technicians");
  return { ok: true, id: tech.id };
}
