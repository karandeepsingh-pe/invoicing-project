import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import {
  applyCoverageEvents,
  type CoverageContext,
  type CoverageEventInput,
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

const TUE_APR_14 = utc(2026, 4, 14);
const SAT_APR_4 = utc(2026, 4, 4);

describe("applyCoverageEvents", () => {
  it("weekday 8h: -1 day from covered (BACKFILL), +1 day to covering, billed at covered rates", () => {
    const events: CoverageEventInput[] = [
      {
        id: "evt1",
        coveredAssignmentId: "A",
        coveringAssignmentId: "B",
        date: TUE_APR_14,
        hours: new Decimal(8),
      },
    ];
    const contextByAssignment = new Map([
      ["A", ctx("A", "BACKFILL", 5333.33, 75, 100)],
      ["B", ctx("B", "NO_BACKFILL", 4800, 60, 90)],
    ]);
    const names = new Map([
      ["A", "Bryan B."],
      ["B", "Steven H."],
    ]);

    const out = applyCoverageEvents({
      events,
      contextByAssignment,
      defaultHours: 8,
      technicianNameByAssignment: names,
    });

    expect(out.daysDeltaByAssignment.get("A")?.toNumber()).toBe(-1);
    expect(out.daysDeltaByAssignment.get("B")?.toNumber()).toBe(1);
    expect(out.otDeltaByAssignment.get("B") ?? new Decimal(0)).toEqual(new Decimal(0));
    expect(out.overrideRateByCoveringAssignment.get("B")?.toNumber()).toBe(5333.33);
    expect(out.overrideOtRateByCoveringAssignment.get("B")?.toNumber()).toBe(75);
    expect(out.overrideWeekendRateByCoveringAssignment.get("B")?.toNumber()).toBe(100);
    expect(out.remarksByAssignment.get("A")?.[0]).toContain("Covered by Steven H.");
    expect(out.remarksByAssignment.get("B")?.[0]).toContain("Backfill for Bryan B.");
  });

  it("weekday 10h: +1 day + 2 OT on covering tech; covered tech only loses 1 day", () => {
    const events: CoverageEventInput[] = [
      {
        id: "evt1",
        coveredAssignmentId: "A",
        coveringAssignmentId: "B",
        date: TUE_APR_14,
        hours: new Decimal(10),
      },
    ];
    const contextByAssignment = new Map([
      ["A", ctx("A", "BACKFILL", 5333.33)],
      ["B", ctx("B", "NO_BACKFILL", 4800)],
    ]);
    const out = applyCoverageEvents({
      events,
      contextByAssignment,
      defaultHours: 8,
      technicianNameByAssignment: new Map([["A", "A"], ["B", "B"]]),
    });
    expect(out.daysDeltaByAssignment.get("A")?.toNumber()).toBe(-1);
    expect(out.daysDeltaByAssignment.get("B")?.toNumber()).toBe(1);
    expect(out.otDeltaByAssignment.get("B")?.toNumber()).toBe(2);
  });

  it("weekend 8h: no day delta on either side; +8 weekend on covering tech", () => {
    const events: CoverageEventInput[] = [
      {
        id: "evt1",
        coveredAssignmentId: "A",
        coveringAssignmentId: "B",
        date: SAT_APR_4,
        hours: new Decimal(8),
      },
    ];
    const contextByAssignment = new Map([
      ["A", ctx("A", "BACKFILL", 5333.33)],
      ["B", ctx("B", "NO_BACKFILL", 4800)],
    ]);
    const out = applyCoverageEvents({
      events,
      contextByAssignment,
      defaultHours: 8,
      technicianNameByAssignment: new Map([["A", "A"], ["B", "B"]]),
    });
    expect(out.daysDeltaByAssignment.get("A") ?? new Decimal(0)).toEqual(new Decimal(0));
    expect(out.daysDeltaByAssignment.get("B") ?? new Decimal(0)).toEqual(new Decimal(0));
    expect(out.weekendDeltaByAssignment.get("B")?.toNumber()).toBe(8);
  });

  it("skips events where covered slaTier !== BACKFILL", () => {
    const events: CoverageEventInput[] = [
      {
        id: "evt1",
        coveredAssignmentId: "A",
        coveringAssignmentId: "B",
        date: TUE_APR_14,
        hours: new Decimal(8),
      },
    ];
    const contextByAssignment = new Map([
      ["A", ctx("A", "NO_BACKFILL", 4800)],
      ["B", ctx("B", "BACKFILL", 5333.33)],
    ]);
    const out = applyCoverageEvents({
      events,
      contextByAssignment,
      defaultHours: 8,
      technicianNameByAssignment: new Map(),
    });
    expect(out.skipped).toHaveLength(1);
    expect(out.skipped[0].reason).toMatch(/NO_BACKFILL/);
    expect(out.daysDeltaByAssignment.size).toBe(0);
  });

  it("partial-day (4h) weekday event = 0.5 day each side", () => {
    const events: CoverageEventInput[] = [
      {
        id: "evt1",
        coveredAssignmentId: "A",
        coveringAssignmentId: "B",
        date: TUE_APR_14,
        hours: new Decimal(4),
      },
    ];
    const contextByAssignment = new Map([
      ["A", ctx("A", "BACKFILL", 6000)],
      ["B", ctx("B", "BACKFILL", 5000)],
    ]);
    const out = applyCoverageEvents({
      events,
      contextByAssignment,
      defaultHours: 8,
      technicianNameByAssignment: new Map([["A", "A"], ["B", "B"]]),
    });
    expect(out.daysDeltaByAssignment.get("A")?.toNumber()).toBe(-0.5);
    expect(out.daysDeltaByAssignment.get("B")?.toNumber()).toBe(0.5);
  });
});
