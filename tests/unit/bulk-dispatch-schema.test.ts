import { describe, expect, it } from "vitest";
import {
  bulkDispatchRowSchema,
  hoursBetween,
} from "@/lib/schemas/bulk-dispatch-upload";
import {
  cellToTimeString,
  cellToDateString,
  parseYesNo,
} from "@/lib/domain/bulk-cells";
import { bulkScheduledRowSchema } from "@/lib/schemas/bulk-scheduled-upload";

function baseRow(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    technician: "Jane Doe",
    visitDate: "2026-06-03",
    ticketNumber: "INC0123",
    slaCode: "NBD",
    visitType: "",
    workStatus: "",
    inTime: "09:15",
    outTime: "11:45",
    totalHours: "",
    oooHrs: "",
    afterHours: "",
    weekend: "",
    siteCode: "",
    siteLocation: "",
    zipcode: "",
    city: "",
    state: "",
    country: "",
    requestReceivedDate: "",
    proposedOnsiteDate: "",
    visitTime: "",
    travelHours: "",
    travelMiles: "",
    partsAmount: "",
    reimbursementNotes: "",
    notes: "",
    overrideConflict: "",
    overrideReason: "",
    ...overrides,
  };
}

describe("cell normalizers", () => {
  it("Excel time Date -> HH:mm via UTC parts", () => {
    expect(cellToTimeString(new Date(Date.UTC(1899, 11, 30, 9, 12)))).toBe("09:12");
  });

  it("Excel day-fraction number -> HH:mm", () => {
    expect(cellToTimeString(0.5)).toBe("12:00");
    expect(cellToTimeString(0.385416666)).toBe("09:15");
  });

  it("string times zero-pad and strip seconds", () => {
    expect(cellToTimeString("9:5")).toBe("09:05");
    expect(cellToTimeString("16:30:00")).toBe("16:30");
    expect(cellToTimeString("")).toBe("");
  });

  it("date cells pass through as ISO", () => {
    expect(cellToDateString(new Date(Date.UTC(2026, 5, 3)))).toBe("2026-06-03");
    expect(cellToDateString("2026-06-03")).toBe("2026-06-03");
  });

  it("parseYesNo handles Y/N/yes/no/blank/garbage", () => {
    expect(parseYesNo("Y", false)).toBe(true);
    expect(parseYesNo("no", true)).toBe(false);
    expect(parseYesNo("", true)).toBe(true);
    expect(parseYesNo("maybe", false)).toBeNull();
  });
});

describe("bulkDispatchRowSchema", () => {
  it("derives Total Hours from In/Out when blank", () => {
    const r = bulkDispatchRowSchema.parse(baseRow());
    expect(r.hoursOnSite).toBeCloseTo(2.5, 2);
    expect(r.workStatus).toBe("COMPLETED");
  });

  it("explicit Total Hours wins over In/Out", () => {
    const r = bulkDispatchRowSchema.parse(baseRow({ totalHours: "3" }));
    expect(r.hoursOnSite).toBe(3);
  });

  it("rejects In without Out", () => {
    const res = bulkDispatchRowSchema.safeParse(baseRow({ outTime: "" }));
    expect(res.success).toBe(false);
  });

  it("rejects Out before In", () => {
    const res = bulkDispatchRowSchema.safeParse(baseRow({ inTime: "11:00", outTime: "09:00" }));
    expect(res.success).toBe(false);
  });

  it("requires Total Hours or an In/Out pair", () => {
    const res = bulkDispatchRowSchema.safeParse(
      baseRow({ inTime: "", outTime: "", totalHours: "" }),
    );
    expect(res.success).toBe(false);
  });

  it("maps Y/N flags and work-status synonyms", () => {
    const r = bulkDispatchRowSchema.parse(
      baseRow({ afterHours: "Yes", weekend: "N", workStatus: "no show", overrideConflict: "y" }),
    );
    expect(r.afterHours).toBe(true);
    expect(r.weekend).toBe(false);
    expect(r.workStatus).toBe("NO_SHOW");
    expect(r.overrideConflict).toBe(true);
  });

  it("rejects a missing SLA code", () => {
    const res = bulkDispatchRowSchema.safeParse(baseRow({ slaCode: "" }));
    expect(res.success).toBe(false);
  });

  it("rejects a malformed date", () => {
    const res = bulkDispatchRowSchema.safeParse(baseRow({ visitDate: "03-06-2026" }));
    expect(res.success).toBe(false);
  });

  it("hoursBetween rounds to 2dp", () => {
    expect(hoursBetween("09:12", "12:10")).toBeCloseTo(2.97, 2);
  });
});

describe("bulkScheduledRowSchema", () => {
  it("maps FULL/HALF synonyms", () => {
    expect(
      bulkScheduledRowSchema.parse({
        technician: "Jared Mattke",
        visitDate: "2026-05-08",
        dayType: "Full Day",
        notes: "",
      }).dayType,
    ).toBe("FULL");
    expect(
      bulkScheduledRowSchema.parse({
        technician: "Jared Mattke",
        visitDate: "2026-05-08",
        dayType: "half",
        notes: "",
      }).dayType,
    ).toBe("HALF");
  });

  it("rejects unknown day types and bad dates", () => {
    expect(
      bulkScheduledRowSchema.safeParse({
        technician: "X",
        visitDate: "2026-05-08",
        dayType: "quarter",
        notes: "",
      }).success,
    ).toBe(false);
    expect(
      bulkScheduledRowSchema.safeParse({
        technician: "X",
        visitDate: "08/05/2026",
        dayType: "FULL",
        notes: "",
      }).success,
    ).toBe(false);
  });
});
