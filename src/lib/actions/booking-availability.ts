"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/dev-session";

const DAY_MS = 24 * 60 * 60 * 1000;

const inputSchema = z.object({
  accountId: z.string().min(1),
  visitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD"),
  excludeDispatchVisitId: z.string().min(1).optional(),
});

export type TechBusyWindow = {
  technicianId: string;
  startIso: string;
  endIso: string;
};

export type BusyWindowsResult =
  | { ok: true; windows: TechBusyWindow[] }
  | { ok: false };

/**
 * Live (non-deleted) booking windows on a given date for every technician
 * assigned to the account — feeds the dispatch visit form's availability
 * filter, so the tech dropdown can disable engineers whose existing bookings
 * overlap the slot being entered. `excludeDispatchVisitId` omits the visit's
 * own booking when editing. Read-only; the create/update server actions remain
 * the authoritative conflict check.
 */
export async function getDispatchBusyWindows(input: {
  accountId: string;
  visitDate: string;
  excludeDispatchVisitId?: string;
}): Promise<BusyWindowsResult> {
  await requireAdmin();
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false };
  const { accountId, visitDate, excludeDispatchVisitId } = parsed.data;

  const dayStart = new Date(`${visitDate}T00:00:00.000Z`);
  const dayEnd = new Date(dayStart.getTime() + DAY_MS);

  const assignments = await prisma.assignment.findMany({
    where: { clientAccountId: accountId },
    select: { technicianId: true },
  });
  const technicianIds = Array.from(new Set(assignments.map((a) => a.technicianId)));
  if (technicianIds.length === 0) return { ok: true, windows: [] };

  const bookings = await prisma.technicianBooking.findMany({
    where: {
      technicianId: { in: technicianIds },
      deletedAt: null,
      // Half-open overlap with the day window (uses the booking index).
      startDateTime: { lt: dayEnd },
      endDateTime: { gt: dayStart },
      // Exclude the edited visit's own booking. Explicit OR-with-null so
      // bookings without a linked visit (PROJECT kind) are still included.
      ...(excludeDispatchVisitId
        ? {
            OR: [
              { dispatchVisitId: null },
              { dispatchVisitId: { not: excludeDispatchVisitId } },
            ],
          }
        : {}),
    },
    select: { technicianId: true, startDateTime: true, endDateTime: true },
    orderBy: { startDateTime: "asc" },
  });

  return {
    ok: true,
    windows: bookings.map((b) => ({
      technicianId: b.technicianId,
      startIso: b.startDateTime.toISOString(),
      endIso: b.endDateTime.toISOString(),
    })),
  };
}
