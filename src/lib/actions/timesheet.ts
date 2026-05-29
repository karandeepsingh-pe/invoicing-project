"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/dev-session";
import { saveTimesheetMonthSchema } from "@/lib/schemas/timesheet";
import { monthRange } from "@/lib/invoice/period";
import { isWeekendUtc } from "@/lib/invoice/hours-split";
import { notDeleted } from "@/lib/domain/soft-delete";
import { diffTimesheetCells } from "@/lib/domain/timesheet-diff";
import type { ActionResult } from "./result";

function isoOf(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function saveTimesheetMonth(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdmin();

  let payload: unknown;
  try {
    payload = JSON.parse(String(formData.get("payload") ?? ""));
  } catch {
    return { ok: false, formError: "Invalid timesheet payload." };
  }

  const parsed = saveTimesheetMonthSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      formError: "Validation failed for one or more cells.",
    };
  }
  const { accountId, year, month, cells } = parsed.data;

  const range = monthRange(year, month);
  // Reject cells outside the month — defensive.
  for (const cell of cells) {
    const cellDate = new Date(`${cell.date}T00:00:00.000Z`);
    if (cellDate < range.start || cellDate >= range.end) {
      return {
        ok: false,
        formError: `Cell ${cell.date} is outside ${year}-${String(month).padStart(2, "0")}.`,
      };
    }
  }

  // Confirm all assignmentIds belong to the account (security).
  const assignmentIds = Array.from(new Set(cells.map((c) => c.assignmentId)));
  if (assignmentIds.length > 0) {
    const owned = await prisma.assignment.findMany({
      where: { id: { in: assignmentIds }, clientAccountId: accountId },
      select: { id: true },
    });
    if (owned.length !== assignmentIds.length) {
      return { ok: false, formError: "One or more assignments do not belong to this account." };
    }
  }

  // Defense in depth: every weekday in the month MUST be covered for every
  // submitted assignment. Blank weekdays are auto-filled client-side, but a
  // tampered POST could still strip cells. Reject loudly if any weekday is
  // missing — the DB must never have an empty weekday for an active month.
  if (assignmentIds.length > 0) {
    const cellsByKey = new Set(cells.map((c) => `${c.assignmentId}|${c.date}`));
    for (
      let d = new Date(range.start.getTime());
      d.getTime() < range.end.getTime();
      d.setUTCDate(d.getUTCDate() + 1)
    ) {
      if (isWeekendUtc(d)) continue;
      const iso = d.toISOString().slice(0, 10);
      for (const assignmentId of assignmentIds) {
        if (!cellsByKey.has(`${assignmentId}|${iso}`)) {
          return {
            ok: false,
            formError: `Weekday cell ${iso} is missing — every working day must have a value or status.`,
          };
        }
      }
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Diff against the LIVE (non-soft-deleted) rows for the month, then
      // update-if-changed / create-if-missing. Never hard-delete: a save must
      // not destroy history. Rows the client cleared (absent from the payload)
      // are SOFT-deleted — the weekday-coverage guard above means that only ever
      // hits blanked weekend cells. Re-entering a soft-deleted day is allowed by
      // the partial unique index (it ignores soft-deleted rows).
      const existing = await tx.timesheetEntry.findMany({
        where: {
          ...notDeleted,
          assignmentId: { in: assignmentIds },
          date: { gte: range.start, lt: range.end },
        },
        select: { id: true, assignmentId: true, date: true, hours: true, status: true },
      });

      const diff = diffTimesheetCells(
        existing.map((e) => ({
          id: e.id,
          assignmentId: e.assignmentId,
          dateIso: isoOf(e.date),
          hours: Number(e.hours.toString()),
          status: e.status,
        })),
        cells.map((c) => ({
          assignmentId: c.assignmentId,
          dateIso: c.date,
          hours: c.hours ?? 0,
          status: c.status,
        })),
      );

      if (diff.toCreate.length > 0) {
        await tx.timesheetEntry.createMany({
          data: diff.toCreate.map((c) => ({
            assignmentId: c.assignmentId,
            date: new Date(`${c.dateIso}T00:00:00.000Z`),
            hours: new Prisma.Decimal(c.hours),
            status: c.status,
            enteredById: admin.userId,
          })),
        });
      }
      for (const u of diff.toUpdate) {
        await tx.timesheetEntry.update({
          where: { id: u.id },
          data: { hours: new Prisma.Decimal(u.hours), status: u.status, enteredById: admin.userId },
        });
      }
      if (diff.toSoftDeleteIds.length > 0) {
        await tx.timesheetEntry.updateMany({
          where: { id: { in: diff.toSoftDeleteIds } },
          data: { deletedAt: new Date(), deletedById: admin.userId },
        });
      }
    });

    revalidatePath(`/admin/timesheets/${accountId}`);
    revalidatePath("/admin/timesheets");
    revalidatePath(`/admin/invoices/generate/${accountId}`);
    return { ok: true, message: "Timesheet saved." };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      return { ok: false, formError: `Database error: ${err.code}` };
    }
    throw err;
  }
}
