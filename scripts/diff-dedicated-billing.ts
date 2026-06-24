// READ-ONLY pre-cutover diff: recompute every DEDICATED assignment's monthly
// total under the CURRENT chain (the deployed loadFteRows — day-rate priority,
// per-tech hourly basis, rebadged fallbacks) vs the NEW annual-only chain
// (perTechAnnual > band ANNUAL_RATE > legacy hourly×2080; everyone on the
// day-credit model). Emits a CSV for sign-off.
//
// Coverage (backfill) events are included in the OLD totals (loadFteRows applies
// them); the NEW recompute does not re-apply them — rows with coverage events are
// flagged so they can be compared manually. (Expected: none in current data.)
//
// Usage: DATABASE_URL=... pnpm exec tsx scripts/diff-dedicated-billing.ts [year] [month]
// Default period: 2026 5. Output: scripts/out/dedicated-billing-diff-<Y>-<M>.csv

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import { loadFteRows } from "../src/lib/invoice/fte-rows";
import { monthRange, businessDaysInRange } from "../src/lib/invoice/period";
import { splitEntries, type DayCell } from "../src/lib/invoice/hours-split";
import { dedicatedDayRate, pickBandAnnual } from "../src/lib/invoice/billing-basis";
import { ratesForTechnicianInRange } from "../src/lib/domain/account-rate-resolver";
import { notDeleted } from "../src/lib/domain/soft-delete";

const prisma = new PrismaClient();

function num(v: { toString(): string } | null | undefined): number {
  return v == null ? 0 : Number(v.toString());
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main(): Promise<void> {
  const year = Number(process.argv[2] ?? 2026);
  const month = Number(process.argv[3] ?? 5);
  const range = monthRange(year, month);
  const businessDays = businessDaysInRange(range, []);

  const accounts = await prisma.clientAccount.findMany({
    where: { assignments: { some: { rateCategory: "DEDICATED" } } },
    include: { org: { select: { name: true } } },
    orderBy: { name: "asc" },
  });

  const lines: string[] = [
    [
      "account", "technician", "band", "tier", "rebadged", "oldBasis", "newBasis",
      "daysWorkedOld", "daysWorkedNew", "oldDayRate", "newDayRate",
      "oldTotal", "newTotal", "delta", "flags",
    ].join(","),
  ];

  for (const account of accounts) {
    const accountLabel = `${account.org.name} / ${account.name}`;

    // OLD chain = the deployed engine, verbatim.
    const old = await loadFteRows(account.id, range);
    const oldByTech = new Map(old.rows.map((r) => [r.technicianName, r]));
    for (const u of old.unpriced) {
      oldByTech.set(u.technicianName, {
        technicianName: u.technicianName,
        daysWorked: u.daysWorked,
        dayRate: 0,
        extendedTotal: 0,
      } as (typeof old.rows)[number]);
    }

    // NEW chain: annual-only, recomputed locally over the same data.
    const fullAccount = await prisma.clientAccount.findUnique({
      where: { id: account.id },
      select: {
        defaultHours: true,
        accountRates: { include: { rateSubCategory: true, sla: true } },
      },
    });
    if (!fullAccount) continue;

    const assignments = await prisma.assignment.findMany({
      where: {
        clientAccountId: account.id,
        rateCategory: "DEDICATED",
        startDate: { lt: range.end },
        OR: [{ endDate: null }, { endDate: { gte: range.start } }],
      },
      include: {
        technician: true,
        timesheetEntries: { where: { ...notDeleted, date: { gte: range.start, lt: range.end } } },
        coveredEvents: { where: { ...notDeleted, date: { gte: range.start, lt: range.end } } },
        coveringEvents: { where: { ...notDeleted, date: { gte: range.start, lt: range.end } } },
      },
    });

    for (const a of assignments) {
      const t = a.technician;
      const techName = `${t.firstName} ${t.lastName}`;
      const cells: DayCell[] = a.timesheetEntries.map((e) => ({
        date: e.date,
        hours: new Prisma.Decimal(e.hours.toString()),
        status: e.status,
      }));
      const split = splitEntries(cells, fullAccount.defaultHours);
      const daysWorkedNew = Number(split.regularDays.toFixed(2));
      const otHours = Number(split.otHours.toFixed(2));
      const weekendHours = Number(split.weekendHours.toFixed(2));
      if (daysWorkedNew === 0 && otHours === 0 && weekendHours === 0 && !oldByTech.has(techName)) {
        continue; // no work either chain
      }

      const techRates = ratesForTechnicianInRange(
        fullAccount.accountRates,
        "DEDICATED",
        t.band,
        range.start,
        range.end,
      );
      const findRate = (codes: string[]): number => {
        const row = techRates.find(
          (r) => codes.includes(r.rateSubCategory.code) && r.sla.code === a.slaTier,
        );
        return num(row?.rateAmount);
      };

      // NEW basis: per-tech annual (rebadged + exceptions) > band annual > legacy bridge.
      const perTechAnnual = num(t.annualSalary);
      const bandAnnual = pickBandAnnual(
        findRate(["ANNUAL_RATE"]),
        findRate(["MONTHLY_DAY_RATE", "ANNUAL_BACKFILL"]),
      );
      let newBasis: string;
      let newDayRate: number;
      if (t.isRebadged) {
        newBasis = perTechAnnual > 0 ? "rebadged annualSalary" : "UNPRICED (rebadged, no annual) ⚠";
        newDayRate = dedicatedDayRate(perTechAnnual, businessDays);
      } else if (perTechAnnual > 0) {
        newBasis = "per-tech annualSalary";
        newDayRate = dedicatedDayRate(perTechAnnual, businessDays);
      } else if (bandAnnual > 0) {
        newBasis = "band ANNUAL_RATE";
        newDayRate = dedicatedDayRate(bandAnnual, businessDays);
      } else {
        newBasis = "UNPRICED ⚠";
        newDayRate = 0;
      }

      // OT / weekend rates — unchanged between chains.
      const otRate = t.isRebadged
        ? num(t.rebadgedOtRate)
        : findRate(["OT_HOURLY_RATE", "HOURLY_BACKFILL_OT"]);
      const weekendRate = t.isRebadged
        ? num(t.rebadgedWeekendRate)
        : findRate(["WEEKEND_HOURLY_RATE", "HOURLY_BACKFILL_WEEKEND"]);

      const newTotal =
        Math.round((newDayRate * daysWorkedNew + otRate * otHours + weekendRate * weekendHours) * 100) / 100;

      const oldRow = oldByTech.get(techName);
      const oldTotal = oldRow ? Number(oldRow.extendedTotal.toFixed(2)) : 0;
      const oldDayRate = oldRow ? Number(oldRow.dayRate.toFixed(2)) : 0;
      const daysWorkedOld = oldRow ? Number(oldRow.daysWorked.toFixed(2)) : 0;

      const oldBasis = t.isRebadged
        ? "rebadged (day>monthly>annual>hourly)"
        : t.dedicatedBillingBasis === "HOURLY"
          ? "HOURLY (hours × rate)"
          : perTechAnnual > 0
            ? "per-tech annualSalary"
            : findRate(["DAY_RATE"]) > 0
              ? `flat DAY_RATE ${findRate(["DAY_RATE"])}`
              : bandAnnual > 0
                ? "band ANNUAL_RATE"
                : findRate(["MONTHLY"]) > 0
                  ? `MONTHLY ${findRate(["MONTHLY"])}`
                  : "unpriced";

      const flags: string[] = [];
      const coverageCount = a.coveredEvents.length + a.coveringEvents.length;
      if (coverageCount > 0) flags.push(`${coverageCount} coverage events not re-applied in NEW — compare manually`);
      if (newBasis.includes("UNPRICED")) flags.push("needs manual annual before cutover");

      lines.push(
        [
          csvCell(accountLabel), csvCell(techName), t.band, a.slaTier, t.isRebadged ? "yes" : "no",
          csvCell(oldBasis), csvCell(newBasis),
          daysWorkedOld, daysWorkedNew, oldDayRate, Math.round(newDayRate * 100) / 100,
          oldTotal, newTotal, Math.round((newTotal - oldTotal) * 100) / 100,
          csvCell(flags.join("; ")),
        ].join(","),
      );
    }
  }

  const outDir = path.join(process.cwd(), "scripts", "out");
  mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `dedicated-billing-diff-${year}-${String(month).padStart(2, "0")}.csv`);
  writeFileSync(outFile, lines.join("\n"), "utf8");
  console.log(`Wrote ${lines.length - 1} rows -> ${outFile}\n`);
  console.log(lines.join("\n"));

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
