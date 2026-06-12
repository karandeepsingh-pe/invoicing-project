// Shared dispatch-visit create core — the single write path used by BOTH the
// manual visit form (createDispatchVisit action) and the bulk xlsx upload, so
// every visit obeys identical rules: business-hours In/Out requirement,
// weekend auto-flag, whole-hour booking envelope, conflict check honoring the
// override flag, and the audit trail. Extracted verbatim from the action.

import { Prisma, AuditKind, BookingKind } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { DispatchVisitCreateInput } from "@/lib/schemas/dispatch-visit";
import { bookingEnvelope } from "@/lib/domain/booking-overlap";
import { resolvePostalCodeId } from "@/lib/actions/postal-code-resolve";

export type DispatchConflict = {
  kind: BookingKind;
  startDateTime: string;
  endDateTime: string;
  accountLabel: string;
};

export type DispatchCreateOutcome =
  | { kind: "created"; id: string; clientAccountId: string }
  | { kind: "validation"; fieldErrors: Record<string, string[] | undefined> }
  | { kind: "conflict"; conflicts: DispatchConflict[] }
  | { kind: "notFound" }
  | { kind: "dbError"; code: string };

function isWeekendDate(iso: string): boolean {
  const d = new Date(`${iso}T00:00:00.000Z`).getUTCDay();
  return d === 0 || d === 6;
}

// Compose a UTC instant from a visit date + wall-clock "HH:mm" (same convention
// as every other time in the app: wall-clock-as-UTC, displayed with timeZone:UTC).
function composeUtc(dateIso: string, hhmm: string): Date {
  return new Date(`${dateIso}T${hhmm}:00.000Z`);
}

function decimalOrNull(n: number | undefined): Prisma.Decimal | null {
  return n === undefined ? null : new Prisma.Decimal(n);
}

function dateOrNull(iso: string | undefined): Date | null {
  return iso ? new Date(`${iso}T00:00:00.000Z`) : null;
}

export async function executeDispatchVisitCreate(
  d: DispatchVisitCreateInput,
  adminUserId: string,
): Promise<DispatchCreateOutcome> {
  const assignment = await prisma.assignment.findUnique({
    where: { id: d.assignmentId },
    select: { id: true, technicianId: true, clientAccountId: true },
  });
  if (!assignment) return { kind: "notFound" };

  // Auto-split accounts (a business-hours window is configured) require In/Out so
  // the visit's hours can be split across business vs after-hours windows.
  const acct = await prisma.clientAccount.findUnique({
    where: { id: assignment.clientAccountId },
    select: { businessHoursStart: true, businessHoursEnd: true },
  });
  if (acct?.businessHoursStart && acct.businessHoursEnd && (!d.inTime || !d.outTime)) {
    return {
      kind: "validation",
      fieldErrors: {
        outTime: ["In-Time and Out-Time are required for this account (business-hours auto-split)."],
      },
    };
  }

  const isWeekend = d.weekend || isWeekendDate(d.visitDate);
  const start = d.inTime ? composeUtc(d.visitDate, d.inTime) : null;
  // Out ≤ In = the visit crossed midnight (overnight ticket): end on day+1.
  const crossesMidnight = Boolean(d.inTime && d.outTime && d.outTime <= d.inTime);
  let end = d.outTime ? composeUtc(d.visitDate, d.outTime) : null;
  if (end && crossesMidnight) end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  // The booking holds the whole-hour ENVELOPE of In/Out (floor/ceil) so techs are
  // reserved in hour slots; the visit row keeps the raw minutes for billing.
  const slot = d.inTime && d.outTime ? bookingEnvelope(d.visitDate, d.inTime, d.outTime) : null;

  // Time-slot overlap (half-open [start,end)) against the tech's other live bookings.
  let conflicts: DispatchConflict[] = [];
  if (slot) {
    const overlapping = await prisma.technicianBooking.findMany({
      where: {
        technicianId: assignment.technicianId,
        deletedAt: null,
        startDateTime: { lt: slot.end },
        endDateTime: { gt: slot.start },
      },
      select: { assignmentId: true, kind: true, startDateTime: true, endDateTime: true },
    });
    if (overlapping.length > 0) {
      const ids = Array.from(new Set(overlapping.map((o) => o.assignmentId)));
      const labels = await prisma.assignment.findMany({
        where: { id: { in: ids } },
        select: { id: true, clientAccount: { select: { name: true, org: { select: { name: true } } } } },
      });
      const labelById = new Map(
        labels.map((a) => [a.id, `${a.clientAccount.org.name} / ${a.clientAccount.name}`]),
      );
      conflicts = overlapping.map((o) => ({
        kind: o.kind,
        startDateTime: o.startDateTime.toISOString(),
        endDateTime: o.endDateTime.toISOString(),
        accountLabel: labelById.get(o.assignmentId) ?? "—",
      }));
    }
  }
  const hasConflict = conflicts.length > 0;
  if (hasConflict && !d.override) {
    return { kind: "conflict", conflicts };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const loc = await resolvePostalCodeId(tx, {
        zipcode: d.zipcode,
        locationCity: d.locationCity,
        locationState: d.locationState,
        locationCountry: d.locationCountry,
      });
      if (!loc.ok) return { kind: "validation" as const, fieldErrors: loc.fieldErrors };

      const created = await tx.dispatchVisit.create({
        data: {
          assignmentId: assignment.id,
          visitDate: new Date(`${d.visitDate}T00:00:00.000Z`),
          requestReceivedDate: dateOrNull(d.requestReceivedDate),
          proposedOnsiteDate: dateOrNull(d.proposedOnsiteDate),
          visitTime: d.visitTime ?? null,
          siteCode: d.siteCode ?? null,
          ticketNumber: d.ticketNumber ?? null,
          hoursOnSite: new Prisma.Decimal(d.hoursOnSite),
          oooHrs: decimalOrNull(d.oooHrs),
          afterHours: d.afterHours,
          weekend: isWeekend,
          workStatus: d.workStatus,
          cancellationCharge: decimalOrNull(d.cancellationCharge),
          slaId: d.slaId,
          visitTypeId: d.visitTypeId ?? null,
          startDateTime: start,
          endDateTime: end,
          siteLocation: d.siteLocation ?? null,
          postalCodeId: loc.postalCodeId,
          travelHours: decimalOrNull(d.travelHours),
          travelMiles: decimalOrNull(d.travelMiles),
          partsAmount: decimalOrNull(d.partsAmount),
          reimbursementNotes: d.reimbursementNotes ?? null,
          notes: d.notes ?? null,
          enteredById: adminUserId,
        },
      });

      if (slot) {
        await tx.technicianBooking.create({
          data: {
            technicianId: assignment.technicianId,
            assignmentId: assignment.id,
            kind: BookingKind.DISPATCH,
            startDateTime: slot.start,
            endDateTime: slot.end,
            dispatchVisitId: created.id,
            isOverride: hasConflict && d.override,
            overrideReason: hasConflict && d.override ? (d.overrideReason ?? null) : null,
            enteredById: adminUserId,
          },
        });
        if (hasConflict && d.override) {
          await tx.bookingAuditEvent.create({
            data: {
              kind: AuditKind.OVERLAP_OVERRIDE,
              actorId: adminUserId,
              technicianId: assignment.technicianId,
              assignmentId: assignment.id,
              detail: {
                dispatchVisitId: created.id,
                start: slot.start.toISOString(),
                end: slot.end.toISOString(),
                reason: d.overrideReason ?? null,
                conflicts: conflicts as unknown as Prisma.InputJsonValue,
              },
            },
          });
        }
      }
      return { kind: "created" as const, id: created.id };
    });

    if (result.kind === "validation") {
      return { kind: "validation", fieldErrors: result.fieldErrors };
    }
    return { kind: "created", id: result.id, clientAccountId: assignment.clientAccountId };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      return { kind: "dbError", code: err.code };
    }
    throw err;
  }
}
