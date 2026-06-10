// Coverage-event math for the Dedicated FTE flow.
//
// A coverage event states: on date X, technician C covered Y hours of
// technician A's shift. A must be on a BACKFILL-tier assignment for the
// event to count. C is ANY active pool technician (no account assignment
// required — the covering side is technician-based, 2026-06-10).
//
// Hours are split by the event's date weekday + account defaultHours, mirror-
// ing the timesheet cell semantics:
//   weekday  -> regular = min(hours, defaultHours)  +  OT = max(0, h-d)
//              covered tech: -regularDays day-debit (OT excess is NOT debited
//              from the covered tech because they weren't going to work OT
//              anyway; it's pure additional billable on the backfill line).
//   weekend  -> weekend hours on the backfill line. No day-side debit.
//
// Pricing: ALWAYS the COVERED technician's seat rates (band annual chain, or
// the rebadged tech's personal rates) — the covering tech's own band/type is
// irrelevant. The pre-invoice gets one synthesized "FTE (Backfill)" line per
// (covering technician, covered assignment), showing who covered, the dates,
// the HOURS, and the amount.

import { Prisma } from "@prisma/client";
import { splitCell } from "./hours-split";

const Decimal = Prisma.Decimal;
type DecimalLike = InstanceType<typeof Decimal>;

export type CoverageEventInput = {
  id: string;
  coveredAssignmentId: string;
  coveringTechnicianId: string;
  date: Date;
  hours: DecimalLike;
  /** Pass-through expense paid to the covering tech (travel etc.). */
  expenseAmount?: DecimalLike | null;
  expenseNotes?: string | null;
};

export type CoverageContext = {
  assignmentId: string;
  slaTier: "BACKFILL" | "NO_BACKFILL" | "NONE";
  dayRate: DecimalLike;
  otRate: DecimalLike;
  weekendRate: DecimalLike;
};

export type CoveringTechInfo = {
  name: string;
  bandLabel: string; // "Band 2" | "Rebadged"
  location: string;
};

/** One synthesized pre-invoice backfill line per (covering tech, covered seat). */
export type BackfillLine = {
  coveringTechnicianId: string;
  coveringTechName: string;
  coveringBandLabel: string;
  coveringLocation: string;
  coveredAssignmentId: string;
  coveredTechName: string;
  coveredTierLabel: string; // the COVERED seat's tier shows on the line
  regularDays: DecimalLike;
  otHours: DecimalLike;
  weekendHours: DecimalLike;
  totalHours: DecimalLike;
  perDate: { dateLabel: string; hours: DecimalLike }[];
  dayRate: DecimalLike;
  otRate: DecimalLike;
  weekendRate: DecimalLike;
  /** Pass-through expenses (billed under the footer's Reimbursements, not in the line). */
  expenseTotal: DecimalLike;
  expenseNotes: string[];
};

export type CoverageOutcome = {
  /** Covered tech's regular-days debit (negative). */
  daysDeltaByAssignment: Map<string, DecimalLike>;
  /** "Covered by <name> on MM/DD" remarks for the covered tech's row. */
  remarksByAssignment: Map<string, string[]>;
  /** Synthesized backfill lines, one per (covering tech, covered assignment). */
  backfillLines: BackfillLine[];
  skipped: { event: CoverageEventInput; reason: string }[];
};

function fmtDate(d: Date): string {
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}`;
}

function tierLabel(t: CoverageContext["slaTier"]): string {
  if (t === "BACKFILL") return "Backfill";
  if (t === "NO_BACKFILL") return "No Backfill";
  return "";
}

export function applyCoverageEvents(args: {
  events: CoverageEventInput[];
  contextByAssignment: Map<string, CoverageContext>;
  defaultHours: number;
  technicianNameByAssignment: Map<string, string>;
  coveringTechById: Map<string, CoveringTechInfo>;
}): CoverageOutcome {
  const daysDelta = new Map<string, DecimalLike>();
  const remarks = new Map<string, string[]>();
  const linesByKey = new Map<string, BackfillLine>();
  const skipped: CoverageOutcome["skipped"] = [];

  const pushRemark = (assignmentId: string, line: string) => {
    const list = remarks.get(assignmentId) ?? [];
    remarks.set(assignmentId, [...list, line]);
  };

  for (const event of args.events) {
    const covered = args.contextByAssignment.get(event.coveredAssignmentId);
    const coveringTech = args.coveringTechById.get(event.coveringTechnicianId);

    if (!covered) {
      skipped.push({ event, reason: "Covered assignment not in scope for this period." });
      continue;
    }
    if (!coveringTech) {
      skipped.push({ event, reason: "Covering technician not found." });
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

    // Covered tech: only the regular-day portion is debited.
    const prevDelta = daysDelta.get(event.coveredAssignmentId) ?? new Decimal(0);
    daysDelta.set(event.coveredAssignmentId, prevDelta.minus(split.regularDays));

    const coveredName =
      args.technicianNameByAssignment.get(event.coveredAssignmentId) ?? "—";
    const dateLabel = fmtDate(event.date);
    pushRemark(
      event.coveredAssignmentId,
      `Covered by ${coveringTech.name} on ${dateLabel}`,
    );

    // Backfill line: accumulate per (covering tech, covered assignment) at the
    // covered seat's rates.
    const key = `${event.coveringTechnicianId}|${event.coveredAssignmentId}`;
    const existing = linesByKey.get(key);
    const base: BackfillLine = existing ?? {
      coveringTechnicianId: event.coveringTechnicianId,
      coveringTechName: coveringTech.name,
      coveringBandLabel: coveringTech.bandLabel,
      coveringLocation: coveringTech.location,
      coveredAssignmentId: event.coveredAssignmentId,
      coveredTechName: coveredName,
      coveredTierLabel: tierLabel(covered.slaTier),
      regularDays: new Decimal(0),
      otHours: new Decimal(0),
      weekendHours: new Decimal(0),
      totalHours: new Decimal(0),
      perDate: [],
      dayRate: covered.dayRate,
      otRate: covered.otRate,
      weekendRate: covered.weekendRate,
      expenseTotal: new Decimal(0),
      expenseNotes: [],
    };
    const expense = event.expenseAmount ?? new Decimal(0);
    linesByKey.set(key, {
      ...base,
      regularDays: base.regularDays.plus(split.regularDays),
      otHours: base.otHours.plus(split.otHours),
      weekendHours: base.weekendHours.plus(split.weekendHours),
      totalHours: base.totalHours.plus(event.hours),
      perDate: [...base.perDate, { dateLabel, hours: event.hours }],
      expenseTotal: base.expenseTotal.plus(expense),
      expenseNotes:
        event.expenseNotes && !base.expenseNotes.includes(event.expenseNotes)
          ? [...base.expenseNotes, event.expenseNotes]
          : base.expenseNotes,
    });
  }

  return {
    daysDeltaByAssignment: daysDelta,
    remarksByAssignment: remarks,
    backfillLines: [...linesByKey.values()],
    skipped,
  };
}
