import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import {
  applyCoverageEvents,
  type CoverageContext,
  type CoverageEventInput,
  type CoveringTechInfo,
} from "@/lib/invoice/coverage";

const Decimal = Prisma.Decimal;

function utc(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d));
}

function ctx(
  assignmentId: string,
  slaTier: "BACKFILL" | "NO_BACKFILL" | "NONE",
  dayRate: number,
  otRate = 75,
  weekendRate = 100,
): CoverageContext {
  return {
    assignmentId,
    slaTier,
    dayRate: new Decimal(dayRate),
    otRate: new Decimal(otRate),
    weekendRate: new Decimal(weekendRate),
  };
}

function tech(name: string, bandLabel = "Band 2"): CoveringTechInfo {
  return { name, bandLabel, location: "Coral Springs, Florida" };
}

function event(
  coveredAssignmentId: string,
  coveringTechnicianId: string,
  date: Date,
  hours: number,
  id = "evt1",
): CoverageEventInput {
  return { id, coveredAssignmentId, coveringTechnicianId, date, hours: new Decimal(hours) };
}

const TUE_APR_14 = utc(2026, 4, 14);
const WED_APR_15 = utc(2026, 4, 15);
const SAT_APR_4 = utc(2026, 4, 4);

const ESTEBAN = new Map([["A", ctx("A", "BACKFILL", 253.97, 75, 100)]]);
const NAMES = new Map([["A", "Esteban R."]]);
const JONATHAN = new Map([["J", tech("Jonathan Moore")]]);

describe("applyCoverageEvents (technician-based covering side)", () => {
  it("weekday 8h: -1 day from covered; backfill line = 1 day at the covered seat's rates", () => {
    const out = applyCoverageEvents({
      events: [event("A", "J", TUE_APR_14, 8)],
      contextByAssignment: ESTEBAN,
      defaultHours: 8,
      technicianNameByAssignment: NAMES,
      coveringTechById: JONATHAN,
    });

    expect(out.daysDeltaByAssignment.get("A")?.toNumber()).toBe(-1);
    expect(out.remarksByAssignment.get("A")?.[0]).toContain("Covered by Jonathan Moore");

    expect(out.backfillLines).toHaveLength(1);
    const line = out.backfillLines[0];
    expect(line.coveringTechName).toBe("Jonathan Moore");
    expect(line.coveredTechName).toBe("Esteban R.");
    expect(line.coveredTierLabel).toBe("Backfill");
    expect(line.regularDays.toNumber()).toBe(1);
    expect(line.totalHours.toNumber()).toBe(8);
    expect(line.dayRate.toNumber()).toBe(253.97); // covered seat's rate
    expect(line.otRate.toNumber()).toBe(75);
    expect(line.weekendRate.toNumber()).toBe(100);
  });

  it("the Esteban/Jonathan example: 5h weekday = 0.625 day at the covered day rate", () => {
    const out = applyCoverageEvents({
      events: [event("A", "J", TUE_APR_14, 5)],
      contextByAssignment: ESTEBAN,
      defaultHours: 8,
      technicianNameByAssignment: NAMES,
      coveringTechById: JONATHAN,
    });
    expect(out.daysDeltaByAssignment.get("A")?.toNumber()).toBe(-0.625);
    const line = out.backfillLines[0];
    expect(line.regularDays.toNumber()).toBe(0.625);
    expect(line.totalHours.toNumber()).toBe(5);
    // amount = 0.625 × covered day rate ≡ 5h × (dayRate ÷ 8)
    expect(line.dayRate.times(line.regularDays).toNumber()).toBeCloseTo(158.73, 2);
    expect(line.perDate[0].dateLabel).toBe("04/14");
    expect(line.perDate[0].hours.toNumber()).toBe(5);
  });

  it("weekday 10h: covered loses only 1 day; backfill line carries 1 day + 2 OT", () => {
    const out = applyCoverageEvents({
      events: [event("A", "J", TUE_APR_14, 10)],
      contextByAssignment: ESTEBAN,
      defaultHours: 8,
      technicianNameByAssignment: NAMES,
      coveringTechById: JONATHAN,
    });
    expect(out.daysDeltaByAssignment.get("A")?.toNumber()).toBe(-1);
    const line = out.backfillLines[0];
    expect(line.regularDays.toNumber()).toBe(1);
    expect(line.otHours.toNumber()).toBe(2);
  });

  it("weekend 8h: no day debit; backfill line carries 8 weekend hours", () => {
    const out = applyCoverageEvents({
      events: [event("A", "J", SAT_APR_4, 8)],
      contextByAssignment: ESTEBAN,
      defaultHours: 8,
      technicianNameByAssignment: NAMES,
      coveringTechById: JONATHAN,
    });
    expect(out.daysDeltaByAssignment.get("A") ?? new Decimal(0)).toEqual(new Decimal(0));
    const line = out.backfillLines[0];
    expect(line.regularDays.toNumber()).toBe(0);
    expect(line.weekendHours.toNumber()).toBe(8);
  });

  it("multiple events for the same pair accumulate into ONE line with per-date hours", () => {
    const out = applyCoverageEvents({
      events: [
        event("A", "J", TUE_APR_14, 5, "evt1"),
        event("A", "J", WED_APR_15, 8, "evt2"),
      ],
      contextByAssignment: ESTEBAN,
      defaultHours: 8,
      technicianNameByAssignment: NAMES,
      coveringTechById: JONATHAN,
    });
    expect(out.backfillLines).toHaveLength(1);
    const line = out.backfillLines[0];
    expect(line.regularDays.toNumber()).toBe(1.625);
    expect(line.totalHours.toNumber()).toBe(13);
    expect(line.perDate.map((d) => d.dateLabel)).toEqual(["04/14", "04/15"]);
    expect(out.daysDeltaByAssignment.get("A")?.toNumber()).toBe(-1.625);
  });

  it("covering tech needs NO assignment context — only the covered seat must be in scope", () => {
    const out = applyCoverageEvents({
      events: [event("A", "J", TUE_APR_14, 8)],
      contextByAssignment: ESTEBAN, // only the covered seat
      defaultHours: 8,
      technicianNameByAssignment: NAMES,
      coveringTechById: JONATHAN,
    });
    expect(out.skipped).toHaveLength(0);
    expect(out.backfillLines).toHaveLength(1);
  });

  it("skips events where covered slaTier !== BACKFILL", () => {
    const out = applyCoverageEvents({
      events: [event("A", "J", TUE_APR_14, 8)],
      contextByAssignment: new Map([["A", ctx("A", "NO_BACKFILL", 4800)]]),
      defaultHours: 8,
      technicianNameByAssignment: NAMES,
      coveringTechById: JONATHAN,
    });
    expect(out.skipped).toHaveLength(1);
    expect(out.skipped[0].reason).toMatch(/NO_BACKFILL/);
    expect(out.daysDeltaByAssignment.size).toBe(0);
    expect(out.backfillLines).toHaveLength(0);
  });

  it("expense pass-through: accumulates on the line, never alters hours/day math", () => {
    const out = applyCoverageEvents({
      events: [
        { ...event("A", "J", TUE_APR_14, 5, "evt1"), expenseAmount: new Decimal(10), expenseNotes: "travel" },
        { ...event("A", "J", WED_APR_15, 8, "evt2"), expenseAmount: new Decimal(4.5), expenseNotes: "travel" },
      ],
      contextByAssignment: ESTEBAN,
      defaultHours: 8,
      technicianNameByAssignment: NAMES,
      coveringTechById: JONATHAN,
    });
    const line = out.backfillLines[0];
    expect(line.expenseTotal.toNumber()).toBe(14.5);
    expect(line.expenseNotes).toEqual(["travel"]); // deduped
    // Day math identical to the no-expense case.
    expect(line.regularDays.toNumber()).toBe(1.625);
    expect(out.daysDeltaByAssignment.get("A")?.toNumber()).toBe(-1.625);
  });

  it("events without an expense leave expenseTotal at 0", () => {
    const out = applyCoverageEvents({
      events: [event("A", "J", TUE_APR_14, 8)],
      contextByAssignment: ESTEBAN,
      defaultHours: 8,
      technicianNameByAssignment: NAMES,
      coveringTechById: JONATHAN,
    });
    expect(out.backfillLines[0].expenseTotal.toNumber()).toBe(0);
    expect(out.backfillLines[0].expenseNotes).toEqual([]);
  });

  it("skips events whose covering technician is unknown", () => {
    const out = applyCoverageEvents({
      events: [event("A", "MISSING", TUE_APR_14, 8)],
      contextByAssignment: ESTEBAN,
      defaultHours: 8,
      technicianNameByAssignment: NAMES,
      coveringTechById: JONATHAN,
    });
    expect(out.skipped).toHaveLength(1);
    expect(out.skipped[0].reason).toMatch(/technician not found/i);
  });
});
