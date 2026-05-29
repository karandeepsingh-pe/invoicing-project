/**
 * Shared Prisma `where` fragment restricting a query to live (non-soft-deleted)
 * rows. Spread into the where clause of EVERY read over a soft-deletable model
 * (TimesheetEntry, DispatchVisit, CoverageEvent) so soft-deleted rows never leak
 * into the UI or a generated invoice.
 *
 *   where: { ...notDeleted, assignmentId }
 */
export const notDeleted = { deletedAt: null } as const;
