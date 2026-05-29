// Coverage-event math for the Dedicated FTE flow.
//
// A coverage event states: on date X, technician C covered Y hours of
// technician A's shift. A must be on a BACKFILL-tier assignment for the
// event to count.
//
// Hours are split by the event's date weekday + account defaultHours, mirror-
// ing the timesheet cell semantics:
//   weekday  -> regular = min(hours, defaultHours)  +  OT = max(0, h-d)
//              covered tech: -regularDays day-debit (OT excess is NOT debited
//              from the covered tech because they weren't going to work OT
//              anyway; it's pure additional billable for the covering tech).
//              covering tech: +regularDays day-credit AND +OT hours, billed
//              at the covered tech's day + OT rates.
//   weekend  -> covering tech: +weekendHours, billed at the covered tech's
//              weekend rate. No day-side debit on covered tech.

import { Prisma } from "@prisma/client";
import { splitCell } from "./hours-split";

const Decimal = Prisma.Decimal;
type DecimalLike = InstanceType<typeof Decimal>;

export type CoverageEventInput = {
  id: string;
  coveredAssignmentId: string;
  coveringAssignmentId: string;
  date: Date;
  hours: DecimalLike;
};

export type CoverageContext = {
  assignmentId: string;
  slaTier: "BACKFILL" | "NO_BACKFILL" | "NONE";
  dayRate: DecimalLike;
  otRate: DecimalLike;
  weekendRate: DecimalLike;
};

export type CoverageOutcome = {
  /** Regular-days delta (negative for covered, positive for covering). */
  daysDeltaByAssignment: Map<string, DecimalLike>;
  /** OT hours credit on the covering tech. */
  otDeltaByAssignment: Map<string, DecimalLike>;
  /** Weekend hours credit on the covering tech. */
  weekendDeltaByAssignment: Map<string, DecimalLike>;

  /** Covering tech bills the covered tech's day rate. */
  overrideRateByCoveringAssignment: Map<string, DecimalLike>;
  /** Covering tech bills the covered tech's OT rate. */
  overrideOtRateByCoveringAssignment: Map<string, DecimalLike>;
  /** Covering tech bills the covered tech's weekend rate. */
  overrideWeekendRateByCoveringAssignment: Map<string, DecimalLike>;

  /** Per-assignment human-readable Remarks lines. */
  remarksByAssignment: Map<string, string[]>;

  skipped: { event: CoverageEventInput; reason: string }[];
};

function fmtDate(d: Date): string {
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function applyCoverageEvents(args: {
  events: CoverageEventInput[];
  contextByAssignment: Map<string, CoverageContext>;
  defaultHours: number;
  technicianNameByAssignment: Map<string, string>;
}): CoverageOutcome {
  const daysDelta = new Map<string, DecimalLike>();
  const otDelta = new Map<string, DecimalLike>();
  const weDelta = new Map<string, DecimalLike>();

  const overrideDay = new Map<string, DecimalLike>();
  const overrideOt = new Map<string, DecimalLike>();
  const overrideWe = new Map<string, DecimalLike>();

  const remarks = new Map<string, string[]>();
  const skipped: CoverageOutcome["skipped"] = [];

  const bump = (
    map: Map<string, DecimalLike>,
    assignmentId: string,
    by: DecimalLike,
  ) => {
    const prev = map.get(assignmentId) ?? new Decimal(0);
    map.set(assignmentId, prev.plus(by));
  };
  const pushRemark = (assignmentId: string, line: string) => {
    const list = remarks.get(assignmentId) ?? [];
    list.push(line);
    remarks.set(assignmentId, list);
  };

  for (const event of args.events) {
    const covered = args.contextByAssignment.get(event.coveredAssignmentId);
    const covering = args.contextByAssignment.get(event.coveringAssignmentId);

    if (!covered || !covering) {
      skipped.push({ event, reason: "Assignment not in scope for this period." });
      continue;
    }
    if (covered.slaTier !== "BACKFILL") {
      skipped.push({
        event,
        reason: `Covered assignment slaTier=${covered.slaTier}; coverage only valid when covered tech is BACKFILL tier.`,
      });
      continue;
    }

    // Re-use the same splitter as the timesheet cells for symmetry.
    const split = splitCell(
      { date: event.date, hours: event.hours, status: null },
      args.defaultHours,
    );

    // Covered tech: only the regular-day portion is debited. OT and weekend
    // are pure additional billable for the covering tech (covered tech wasn't
    // scheduled for them).
    bump(daysDelta, event.coveredAssignmentId, split.regularDays.negated());

    // Covering tech: credit regular days, OT hours, weekend hours.
    bump(daysDelta, event.coveringAssignmentId, split.regularDays);
    bump(otDelta, event.coveringAssignmentId, split.otHours);
    bump(weDelta, event.coveringAssignmentId, split.weekendHours);

    // Bill the covering tech at the covered tech's rates.
    overrideDay.set(event.coveringAssignmentId, covered.dayRate);
    overrideOt.set(event.coveringAssignmentId, covered.otRate);
    overrideWe.set(event.coveringAssignmentId, covered.weekendRate);

    const coveredName =
      args.technicianNameByAssignment.get(event.coveredAssignmentId) ?? "—";
    const coveringName =
      args.technicianNameByAssignment.get(event.coveringAssignmentId) ?? "—";
    const dateLabel = fmtDate(event.date);

    pushRemark(
      event.coveringAssignmentId,
      `Backfill for ${coveredName} on ${dateLabel}`,
    );
    pushRemark(
      event.coveredAssignmentId,
      `Covered by ${coveringName} on ${dateLabel}`,
    );
  }

  return {
    daysDeltaByAssignment: daysDelta,
    otDeltaByAssignment: otDelta,
    weekendDeltaByAssignment: weDelta,
    overrideRateByCoveringAssignment: overrideDay,
    overrideOtRateByCoveringAssignment: overrideOt,
    overrideWeekendRateByCoveringAssignment: overrideWe,
    remarksByAssignment: remarks,
    skipped,
  };
}
