"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/dev-session";
import { holidayCreateSchema, holidayUpdateSchema } from "@/lib/schemas/holiday";
import type { ActionResult } from "./result";

function toUtcDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function revalidateHolidays() {
  revalidatePath("/admin/masters/holidays");
  // Holidays drive the Dedicated timesheet PH overlay, so bust every account's
  // timesheet page. The bracketed dynamic-route form is required here (no concrete
  // accountId in scope, and there is no layout segment under /admin/timesheets).
  revalidatePath("/admin/timesheets/[accountId]", "page");
}

export async function createHoliday(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = holidayCreateSchema.safeParse({
    date: formData.get("date"),
    name: formData.get("name"),
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const h = await prisma.holiday.create({
      data: { date: toUtcDate(parsed.data.date), name: parsed.data.name },
    });
    revalidateHolidays();
    return { ok: true, id: h.id };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, fieldErrors: { date: ["A holiday already exists on that date"] } };
    }
    throw err;
  }
}

export async function updateHoliday(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = holidayUpdateSchema.safeParse({
    id: formData.get("id"),
    date: formData.get("date"),
    name: formData.get("name"),
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const { id, date, name } = parsed.data;
  try {
    await prisma.holiday.update({ where: { id }, data: { date: toUtcDate(date), name } });
    revalidateHolidays();
    return { ok: true, message: "Holiday updated." };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, fieldErrors: { date: ["A holiday already exists on that date"] } };
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return { ok: false, formError: "Holiday not found." };
    }
    throw err;
  }
}

export async function deleteHoliday(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, formError: "Missing holiday id." };
  try {
    const h = await prisma.holiday.delete({ where: { id } });
    revalidateHolidays();
    return { ok: true, message: `Deleted "${h.name}".` };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return { ok: false, formError: "Holiday not found." };
    }
    throw err;
  }
}
