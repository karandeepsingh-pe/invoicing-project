import type { DispatchWorkStatus } from "@prisma/client";

/**
 * Only COMPLETED visits are billed. Cancelled / rescheduled / no-show / pending
 * still appear on the tracker (for the record) but at Billed = 0 and excluded
 * from the billable total. Shared by the dispatch + combined generators so the
 * rule can never drift between the two paths.
 */
export function isBillableStatus(status: DispatchWorkStatus | string): boolean {
  return status === "COMPLETED";
}
