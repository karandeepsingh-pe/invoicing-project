"use server";

import { revalidatePath } from "next/cache";
import { Prisma, AuditKind } from "@prisma/client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { requireAdmin } from "@/lib/auth/dev-session";
import { monthRange } from "@/lib/invoice/period";
import { pickRestorableIds } from "@/lib/domain/timesheet-month";
import {
  softDeleteCellSchema,
  softDeleteRowMonthSchema,
  softDeleteRowsMonthSchema,
  softDeleteAccountTypeMonthSchema,
} from "@/lib/schemas/soft-delete";
import type { ActionResult } from "./result";

// Testing-phase gate. Returns an error ActionResult when disabled, else null.
function softDeleteGuard(): ActionResult {
  if (!env.SOFT_DELETE_ENABLED) {
    return {
      ok: false,
      formError:
        "Soft-delete is disabled. Set SOFT_DELETE_ENABLED=true to enable it (testing only).",
    };
  }
  return null;
}

type Tx = Prisma.TransactionClient;

async function recordAudit(
  tx: Tx,
  args: {
    kind: AuditKind;
    actorId: string;
    technicianId?: string | null;
    assignmentId?: string | null;
    detail: Prisma.InputJsonValue;
  },
): Promise<void> {
  await tx.bookingAuditEvent.create({
    data: {
      kind: args.kind,
      actorId: args.actorId,
      technicianId: args.technicianId ?? null,
      assignmentId: args.assignmentId ?? null,
      detail: args.detail,
    },
  });
}

async function hasInvoiceRun(
  tx: Tx,
  accountId: string,
  year: number,
  month: number,
): Promise<boolean> {
  const n = await tx.invoiceRun.count({
    where: { clientAccountId: accountId, periodYear: year, periodMonth: month },
  });
  return n > 0;
}

/**
 * Soft-delete every LIVE timesheet entry matching a SCALAR where clause, then
 * cascade-soft-delete any live coverage event referencing one of the deleted
 * (coveredAssignmentId, date) pairs. `where` must be scalar-only (assignmentId /
 * date) because Prisma updateMany does not accept relation filters.
 */
async function softDeleteTimesheets(
  tx: Tx,
  where: Prisma.TimesheetEntryWhereInput,
  actorId: string,
): Promise<{ entries: number; coverage: number }> {
  const liveWhere = { ...where, deletedAt: null };
  const victims = await tx.timesheetEntry.findMany({
    where: liveWhere,
    select: { assignmentId: true, date: true },
  });
  if (victims.length === 0) return { entries: 0, coverage: 0 };

  const now = new Date();
  await tx.timesheetEntry.updateMany({
    where: liveWhere,
    data: { deletedAt: now, deletedById: actorId },
  });

  const cov = await tx.coverageEvent.updateMany({
    where: {
      deletedAt: null,
      OR: victims.map((v) => ({
        coveredAssignmentId: v.assignmentId,
        date: v.date,
      })),
    },
    data: { deletedAt: now, deletedById: actorId },
  });

  return { entries: victims.length, coverage: cov.count };
}

function revalidateTimesheet(accountId: string): void {
  revalidatePath(`/admin/timesheets/${accountId}`);
  revalidatePath(`/admin/timesheets/${accountId}/coverage`);
  revalidatePath(`/admin/invoices/generate/${accountId}`);
}

function dayKey(id: string, date: Date): string {
  return `${id}|${date.toISOString()}`;
}

/**
 * Restore (un-soft-delete) the soft-deleted TimesheetEntry rows matching a SCALAR
 * where clause, then best-effort restore the coverage events that were
 * cascade-soft-deleted with them.
 *
 * Both timesheet_entries and coverage_events carry only a PARTIAL unique index
 * (... WHERE deletedAt IS NULL), so a single (assignment, day) key can legitimately
 * accumulate MANY soft-deleted rows via delete -> re-enter -> delete cycles. We
 * therefore revive AT MOST ONE deleted row per key (the most recent), and skip any
 * key that already has a live row, so reviving can never violate the unique index.
 * `where` must be scalar-only (assignmentId / date).
 */
async function restoreTimesheets(
  tx: Tx,
  where: Prisma.TimesheetEntryWhereInput,
): Promise<{ entries: number; coverage: number }> {
  const deletedWhere = { ...where, deletedAt: { not: null } };
  const deletedEntries = await tx.timesheetEntry.findMany({
    where: deletedWhere,
    select: { id: true, assignmentId: true, date: true },
    orderBy: { createdAt: "desc" },
  });
  if (deletedEntries.length === 0) return { entries: 0, coverage: 0 };

  const liveEntries = await tx.timesheetEntry.findMany({
    where: {
      deletedAt: null,
      OR: deletedEntries.map((e) => ({ assignmentId: e.assignmentId, date: e.date })),
    },
    select: { assignmentId: true, date: true },
  });
  const liveEntryKeys = new Set(liveEntries.map((e) => dayKey(e.assignmentId, e.date)));
  const entryIdsToRestore = pickRestorableIds(
    deletedEntries.map((e) => ({ id: e.id, key: dayKey(e.assignmentId, e.date) })),
    liveEntryKeys,
  );
  if (entryIdsToRestore.length > 0) {
    await tx.timesheetEntry.updateMany({
      where: { id: { in: entryIdsToRestore } },
      data: { deletedAt: null, deletedById: null },
    });
  }

  // Best-effort restore of the coverage events cascaded on delete, with the same
  // one-per-key dedup and skip-if-live guard. dayPairs is deduped so the OR stays small.
  const dayPairs = Array.from(
    new Map(
      deletedEntries.map((e) => [
        dayKey(e.assignmentId, e.date),
        { coveredAssignmentId: e.assignmentId, date: e.date },
      ]),
    ).values(),
  );
  const deletedCov = await tx.coverageEvent.findMany({
    where: { deletedAt: { not: null }, OR: dayPairs },
    select: { id: true, coveredAssignmentId: true, date: true },
    orderBy: { createdAt: "desc" },
  });
  let coverage = 0;
  if (deletedCov.length > 0) {
    const liveCov = await tx.coverageEvent.findMany({
      where: {
        deletedAt: null,
        OR: deletedCov.map((c) => ({ coveredAssignmentId: c.coveredAssignmentId, date: c.date })),
      },
      select: { coveredAssignmentId: true, date: true },
    });
    const liveCovKeys = new Set(liveCov.map((c) => dayKey(c.coveredAssignmentId, c.date)));
    const covIdsToRestore = pickRestorableIds(
      deletedCov.map((c) => ({ id: c.id, key: dayKey(c.coveredAssignmentId, c.date) })),
      liveCovKeys,
    );
    if (covIdsToRestore.length > 0) {
      const r = await tx.coverageEvent.updateMany({
        where: { id: { in: covIdsToRestore } },
        data: { deletedAt: null, deletedById: null },
      });
      coverage = r.count;
    }
  }

  return { entries: entryIdsToRestore.length, coverage };
}

// ── Cell ────────────────────────────────────────────────────────────────────
export async function softDeleteTimesheetCell(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const blocked = softDeleteGuard();
  if (blocked) return blocked;
  const admin = await requireAdmin();

  const parsed = softDeleteCellSchema.safeParse({
    assignmentId: formData.get("assignmentId"),
    date: formData.get("date"),
  });
  if (!parsed.success) return { ok: false, formError: "Invalid input." };
  const { assignmentId, date } = parsed.data;
  const day = new Date(`${date}T00:00:00.000Z`);

  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    select: { clientAccountId: true, technicianId: true },
  });
  if (!assignment) return { ok: false, formError: "Assignment not found." };

  const result = await prisma.$transaction(async (tx) => {
    const counts = await softDeleteTimesheets(tx, { assignmentId, date: day }, admin.userId);
    if (counts.entries === 0) return counts;
    await recordAudit(tx, {
      kind: AuditKind.SOFT_DELETE,
      actorId: admin.userId,
      technicianId: assignment.technicianId,
      assignmentId,
      detail: { scope: "cell", date, ...counts },
    });
    if (await hasInvoiceRun(tx, assignment.clientAccountId, day.getUTCFullYear(), day.getUTCMonth() + 1)) {
      await recordAudit(tx, {
        kind: AuditKind.DELETE_AFTER_INVOICE,
        actorId: admin.userId,
        technicianId: assignment.technicianId,
        assignmentId,
        detail: { scope: "cell", date, accountId: assignment.clientAccountId },
      });
    }
    return counts;
  });

  revalidateTimesheet(assignment.clientAccountId);
  if (result.entries === 0) {
    return { ok: true, message: "Nothing to delete — cell was already empty." };
  }
  const extra = result.coverage > 0 ? ` (${result.coverage} coverage event(s) also removed)` : "";
  return { ok: true, message: `Deleted ${date}${extra}.` };
}

// ── Technician row for a month ────────────────────────────────────────────────
export async function softDeleteTimesheetRowMonth(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const blocked = softDeleteGuard();
  if (blocked) return blocked;
  const admin = await requireAdmin();

  const parsed = softDeleteRowMonthSchema.safeParse({
    assignmentId: formData.get("assignmentId"),
    year: formData.get("year"),
    month: formData.get("month"),
  });
  if (!parsed.success) return { ok: false, formError: "Invalid input." };
  const { assignmentId, year, month } = parsed.data;
  const range = monthRange(year, month);

  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    select: { clientAccountId: true, technicianId: true },
  });
  if (!assignment) return { ok: false, formError: "Assignment not found." };

  const result = await prisma.$transaction(async (tx) => {
    const counts = await softDeleteTimesheets(
      tx,
      { assignmentId, date: { gte: range.start, lt: range.end } },
      admin.userId,
    );
    if (counts.entries === 0) return counts;
    await recordAudit(tx, {
      kind: AuditKind.SOFT_DELETE,
      actorId: admin.userId,
      technicianId: assignment.technicianId,
      assignmentId,
      detail: { scope: "row-month", year, month, ...counts },
    });
    if (await hasInvoiceRun(tx, assignment.clientAccountId, year, month)) {
      await recordAudit(tx, {
        kind: AuditKind.DELETE_AFTER_INVOICE,
        actorId: admin.userId,
        technicianId: assignment.technicianId,
        assignmentId,
        detail: { scope: "row-month", year, month, accountId: assignment.clientAccountId },
      });
    }
    return counts;
  });

  revalidateTimesheet(assignment.clientAccountId);
  if (result.entries === 0) return { ok: true, message: "Nothing to delete this month." };
  return {
    ok: true,
    message: `Deleted ${result.entries} day(s)${result.coverage > 0 ? ` and ${result.coverage} coverage event(s)` : ""}.`,
  };
}

// ── Several technician rows for a month (bulk) ───────────────────────────────
export async function softDeleteTimesheetRowsMonth(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const blocked = softDeleteGuard();
  if (blocked) return blocked;
  const admin = await requireAdmin();

  const parsed = softDeleteRowsMonthSchema.safeParse({
    assignmentIds: formData.getAll("assignmentIds"),
    year: formData.get("year"),
    month: formData.get("month"),
  });
  if (!parsed.success) return { ok: false, formError: "Invalid input." };
  const ids = Array.from(new Set(parsed.data.assignmentIds));
  const { year, month } = parsed.data;
  const range = monthRange(year, month);

  // All rows on one grid share an account; resolve it from the live assignments.
  const assignments = await prisma.assignment.findMany({
    where: { id: { in: ids } },
    select: { id: true, clientAccountId: true },
  });
  if (assignments.length === 0) return { ok: false, formError: "Assignment(s) not found." };
  const foundIds = assignments.map((a) => a.id);
  const accountId = assignments[0].clientAccountId;

  const result = await prisma.$transaction(async (tx) => {
    const counts = await softDeleteTimesheets(
      tx,
      { assignmentId: { in: foundIds }, date: { gte: range.start, lt: range.end } },
      admin.userId,
    );
    if (counts.entries === 0) return counts;
    await recordAudit(tx, {
      kind: AuditKind.SOFT_DELETE,
      actorId: admin.userId,
      detail: { scope: "rows-month", year, month, technicians: foundIds.length, ...counts },
    });
    if (await hasInvoiceRun(tx, accountId, year, month)) {
      await recordAudit(tx, {
        kind: AuditKind.DELETE_AFTER_INVOICE,
        actorId: admin.userId,
        detail: { scope: "rows-month", year, month, accountId },
      });
    }
    return counts;
  });

  revalidateTimesheet(accountId);
  if (result.entries === 0) return { ok: true, message: "Nothing to delete this month." };
  const techNoun = foundIds.length === 1 ? "technician" : "technicians";
  const covExtra = result.coverage > 0 ? ` and ${result.coverage} coverage event(s)` : "";
  return {
    ok: true,
    message: `Deleted ${result.entries} day(s) across ${foundIds.length} ${techNoun}${covExtra}.`,
  };
}

// ── Restore one technician row for a month ────────────────────────────────────
export async function restoreTimesheetRowMonth(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const blocked = softDeleteGuard();
  if (blocked) return blocked;
  const admin = await requireAdmin();

  const parsed = softDeleteRowMonthSchema.safeParse({
    assignmentId: formData.get("assignmentId"),
    year: formData.get("year"),
    month: formData.get("month"),
  });
  if (!parsed.success) return { ok: false, formError: "Invalid input." };
  const { assignmentId, year, month } = parsed.data;
  const range = monthRange(year, month);

  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    select: { clientAccountId: true, technicianId: true },
  });
  if (!assignment) return { ok: false, formError: "Assignment not found." };

  try {
    const result = await prisma.$transaction(async (tx) => {
      const counts = await restoreTimesheets(tx, {
        assignmentId,
        date: { gte: range.start, lt: range.end },
      });
      if (counts.entries === 0) return counts;
      await recordAudit(tx, {
        kind: AuditKind.SOFT_DELETE,
        actorId: admin.userId,
        technicianId: assignment.technicianId,
        assignmentId,
        detail: { action: "restore", scope: "row-month", year, month, ...counts },
      });
      return counts;
    });
    revalidateTimesheet(assignment.clientAccountId);
    if (result.entries === 0) return { ok: true, message: "Nothing to restore this month." };
    return {
      ok: true,
      message: `Restored ${result.entries} day(s)${result.coverage > 0 ? ` and ${result.coverage} coverage event(s)` : ""}.`,
    };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return {
        ok: false,
        formError:
          "Cannot restore. Some of those days were re-entered after the delete. Clear them first.",
      };
    }
    throw err;
  }
}

// ── Restore several technician rows for a month (bulk) ────────────────────────
export async function restoreTimesheetRowsMonth(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const blocked = softDeleteGuard();
  if (blocked) return blocked;
  const admin = await requireAdmin();

  const parsed = softDeleteRowsMonthSchema.safeParse({
    assignmentIds: formData.getAll("assignmentIds"),
    year: formData.get("year"),
    month: formData.get("month"),
  });
  if (!parsed.success) return { ok: false, formError: "Invalid input." };
  const ids = Array.from(new Set(parsed.data.assignmentIds));
  const { year, month } = parsed.data;
  const range = monthRange(year, month);

  const assignments = await prisma.assignment.findMany({
    where: { id: { in: ids } },
    select: { id: true, clientAccountId: true },
  });
  if (assignments.length === 0) return { ok: false, formError: "Assignment(s) not found." };
  const foundIds = assignments.map((a) => a.id);
  const accountId = assignments[0].clientAccountId;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const counts = await restoreTimesheets(tx, {
        assignmentId: { in: foundIds },
        date: { gte: range.start, lt: range.end },
      });
      if (counts.entries === 0) return counts;
      await recordAudit(tx, {
        kind: AuditKind.SOFT_DELETE,
        actorId: admin.userId,
        detail: {
          action: "restore",
          scope: "rows-month",
          year,
          month,
          technicians: foundIds.length,
          ...counts,
        },
      });
      return counts;
    });
    revalidateTimesheet(accountId);
    if (result.entries === 0) return { ok: true, message: "Nothing to restore this month." };
    const techNoun = foundIds.length === 1 ? "technician" : "technicians";
    const covExtra = result.coverage > 0 ? ` and ${result.coverage} coverage event(s)` : "";
    return {
      ok: true,
      message: `Restored ${result.entries} day(s) across ${foundIds.length} ${techNoun}${covExtra}.`,
    };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return {
        ok: false,
        formError:
          "Cannot restore. Some of those days were re-entered after the delete. Clear them first.",
      };
    }
    throw err;
  }
}

// ── Whole month for an account + invoice type ─────────────────────────────────
export async function softDeleteAccountTypeMonth(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const blocked = softDeleteGuard();
  if (blocked) return blocked;
  const admin = await requireAdmin();

  const parsed = softDeleteAccountTypeMonthSchema.safeParse({
    accountId: formData.get("accountId"),
    rateCategory: formData.get("rateCategory"),
    year: formData.get("year"),
    month: formData.get("month"),
  });
  if (!parsed.success) return { ok: false, formError: "Invalid input." };
  const { accountId, rateCategory, year, month } = parsed.data;
  const range = monthRange(year, month);

  const assignments = await prisma.assignment.findMany({
    where: { clientAccountId: accountId, rateCategory },
    select: { id: true },
  });
  const assignmentIds = assignments.map((a) => a.id);
  if (assignmentIds.length === 0) {
    return { ok: true, message: "No assignments of that type on this account." };
  }

  const isDispatch = rateCategory === "DISPATCH_SCHED";

  const result = await prisma.$transaction(async (tx) => {
    let entries = 0;
    let coverage = 0;
    if (isDispatch) {
      const victims = await tx.dispatchVisit.findMany({
        where: {
          assignmentId: { in: assignmentIds },
          visitDate: { gte: range.start, lt: range.end },
          deletedAt: null,
        },
        select: { id: true },
      });
      if (victims.length > 0) {
        const ids = victims.map((v) => v.id);
        const now = new Date();
        await tx.dispatchVisit.updateMany({
          where: { id: { in: ids } },
          data: { deletedAt: now, deletedById: admin.userId },
        });
        // Cascade-soft-delete the linked booking calendar entries.
        await tx.technicianBooking.updateMany({
          where: { dispatchVisitId: { in: ids }, deletedAt: null },
          data: { deletedAt: now, deletedById: admin.userId },
        });
      }
      entries = victims.length;
    } else {
      const counts = await softDeleteTimesheets(
        tx,
        { assignmentId: { in: assignmentIds }, date: { gte: range.start, lt: range.end } },
        admin.userId,
      );
      entries = counts.entries;
      coverage = counts.coverage;
    }
    if (entries === 0) return { entries, coverage };
    await recordAudit(tx, {
      kind: AuditKind.SOFT_DELETE,
      actorId: admin.userId,
      detail: { scope: "account-month", accountId, rateCategory, year, month, entries, coverage },
    });
    if (await hasInvoiceRun(tx, accountId, year, month)) {
      await recordAudit(tx, {
        kind: AuditKind.DELETE_AFTER_INVOICE,
        actorId: admin.userId,
        detail: { scope: "account-month", accountId, rateCategory, year, month },
      });
    }
    return { entries, coverage };
  });

  revalidateTimesheet(accountId);
  revalidatePath(`/admin/dispatch-visits/${accountId}`);
  if (result.entries === 0) return { ok: true, message: "Nothing to delete this month." };
  const noun = isDispatch ? "visit(s)" : "day(s)";
  const extra = result.coverage > 0 ? ` and ${result.coverage} coverage event(s)` : "";
  return { ok: true, message: `Deleted ${result.entries} ${noun}${extra}.` };
}
