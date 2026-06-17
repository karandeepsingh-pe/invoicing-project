"use server";

import { revalidatePath } from "next/cache";
import { Prisma, type TimesheetDayStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAccountAccess, requireSession } from "@/lib/auth/session";
import {
  saveTimesheetMonthSchema,
  saveTimesheetCellsSchema,
} from "@/lib/schemas/timesheet";
import { monthRange } from "@/lib/invoice/period";
import { isWeekendUtc } from "@/lib/invoice/hours-split";
import { isWithinWindow, toDayIso } from "@/lib/invoice/assignment-window";
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
  const admin = await requireSession();

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
  await requireAccountAccess(accountId);

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

/**
 * Incremental autosave of a set of individual cells. Each cell either upserts a
 * value/status or (with `clear: true`) soft-deletes that one live entry. Unlike
 * `saveTimesheetMonth`, this touches ONLY the submitted cells (no whole-month
 * completeness gate, no mass soft-delete of unsubmitted cells) and does NOT
 * revalidate the timesheet page, so the grid can autosave per cell without a
 * heavy re-render. Used by the grid's per-cell / fill-range / default-commit saves.
 */
export async function saveTimesheetCells(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireSession();

  let payload: unknown;
  try {
    payload = JSON.parse(String(formData.get("payload") ?? ""));
  } catch {
    return { ok: false, formError: "Invalid timesheet payload." };
  }
  const parsed = saveTimesheetCellsSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, formError: "Validation failed for one or more cells." };
  }
  const { accountId, cells } = parsed.data;
  await requireAccountAccess(accountId);

  // Security: every assignment in the payload must belong to this account.
  const assignmentIds = Array.from(new Set(cells.map((c) => c.assignmentId)));
  const owned = await prisma.assignment.findMany({
    where: { id: { in: assignmentIds }, clientAccountId: accountId },
    select: { id: true, startDate: true, endDate: true },
  });
  if (owned.length !== assignmentIds.length) {
    return { ok: false, formError: "One or more assignments do not belong to this account." };
  }

  // Defense in depth: never persist a value/status for a day outside the
  // assignment's active window (end inclusive). Clearing a stray cell is always
  // allowed. The grid already locks these cells; this guards tampered POSTs.
  const windowById = new Map(
    owned.map((a) => [a.id, { start: toDayIso(a.startDate), end: a.endDate ? toDayIso(a.endDate) : null }]),
  );
  for (const c of cells) {
    if (c.clear) continue;
    const w = windowById.get(c.assignmentId);
    if (w && !isWithinWindow(c.date, w.start, w.end)) {
      return { ok: false, formError: `${c.date} is outside the assignment's active dates.` };
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      const dateObjs = Array.from(new Set(cells.map((c) => c.date))).map(
        (d) => new Date(`${d}T00:00:00.000Z`),
      );
      const live = await tx.timesheetEntry.findMany({
        where: { assignmentId: { in: assignmentIds }, deletedAt: null, date: { in: dateObjs } },
        select: { id: true, assignmentId: true, date: true },
      });
      const liveId = new Map<string, string>();
      for (const e of live) liveId.set(`${e.assignmentId}|${isoOf(e.date)}`, e.id);

      const toCreate: {
        assignmentId: string;
        date: Date;
        hours: Prisma.Decimal;
        status: TimesheetDayStatus | null;
        enteredById: string;
      }[] = [];
      const toUpdate: { id: string; hours: Prisma.Decimal; status: TimesheetDayStatus | null }[] = [];
      const toSoftDelete: string[] = [];

      for (const c of cells) {
        const existingId = liveId.get(`${c.assignmentId}|${c.date}`);
        if (c.clear) {
          if (existingId) toSoftDelete.push(existingId);
          continue;
        }
        const hours = new Prisma.Decimal(c.status ? 0 : c.hours ?? 0);
        const status = c.status ?? null;
        if (existingId) {
          toUpdate.push({ id: existingId, hours, status });
        } else {
          toCreate.push({
            assignmentId: c.assignmentId,
            date: new Date(`${c.date}T00:00:00.000Z`),
            hours,
            status,
            enteredById: admin.userId,
          });
        }
      }

      if (toCreate.length > 0) await tx.timesheetEntry.createMany({ data: toCreate });
      for (const u of toUpdate) {
        await tx.timesheetEntry.update({
          where: { id: u.id },
          data: { hours: u.hours, status: u.status, enteredById: admin.userId },
        });
      }
      if (toSoftDelete.length > 0) {
        await tx.timesheetEntry.updateMany({
          where: { id: { in: toSoftDelete } },
          data: { deletedAt: new Date(), deletedById: admin.userId },
        });
      }
    });

    // Deliberately NO timesheet-page revalidation: the grid keeps its own saved
    // state, so we avoid a router.refresh per autosave. The invoice-generate views
    // pick up fresh data on their next load.
    revalidatePath(`/admin/invoices/generate/${accountId}`);
    revalidatePath(`/admin/invoices/generate/${accountId}/combined`);
    return { ok: true };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      return { ok: false, formError: `Database error: ${err.code}` };
    }
    throw err;
  }
}
