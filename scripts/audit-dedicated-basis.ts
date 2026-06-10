// READ-ONLY audit for the annual-only Dedicated basis cutover.
//
// For every account with DEDICATED rates or assignments, prints per (band, tier):
// the stored basis-row amounts (Annual / Day / Monthly / Hourly / legacy), which
// basis WINS under the CURRENT resolver chain, and which would win under the NEW
// annual-only chain — flagging bands that need a manual annual entered before the
// cutover (flat day-rate-only bands cannot be derived).
//
// Also lists: technicians on dedicatedBillingBasis=HOURLY with active DEDICATED
// assignments, and rebadged techs with no annualSalary (would go unpriced).
//
// Usage: DATABASE_URL=... pnpm exec tsx scripts/audit-dedicated-basis.ts [--backfill]
//
// --backfill (opt-in WRITE mode): for every band×tier whose ANNUAL_RATE is blank
// but MONTHLY or HOURLY is filled, create the ANNUAL_RATE row (monthly×12 or
// hourly×2080). Rollback-neutral: the OLD resolver prefers DAY_RATE over the new
// annual, and a monthly-derived annual yields the identical day rate. Flat
// DAY_RATE-only bands are never auto-derived (reported for manual entry).

import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BACKFILL = process.argv.includes("--backfill");
// Matches src/lib/actions/account-rate.ts ALWAYS_ACTIVE_FROM convention.
const ALWAYS_ACTIVE_FROM = new Date("2000-01-01T00:00:00.000Z");
const ANNUAL_WORK_HOURS = 2080;

type BasisCell = {
  annual: number;
  day: number;
  monthly: number;
  hourly: number;
  legacyHourly: number; // MONTHLY_DAY_RATE / ANNUAL_BACKFILL (annual/2080 convention)
};

function num(v: { toString(): string } | null | undefined): number {
  return v == null ? 0 : Number(v.toString());
}

// Mirrors billing-basis.ts resolveDedicatedDayRate priority for the band sheet
// (per-tech annual handled separately, per technician).
function currentWinner(c: BasisCell): string {
  if (c.day > 0) return "DAY_RATE (flat/day)";
  if (c.annual > 0) return "ANNUAL_RATE";
  if (c.legacyHourly > 0) return "LEGACY hourly×2080";
  if (c.monthly > 0) return "MONTHLY";
  return "UNPRICED";
}

function newWinner(c: BasisCell): string {
  if (c.annual > 0) return "ANNUAL_RATE";
  if (c.legacyHourly > 0) return "LEGACY hourly×2080";
  if (c.day > 0 || c.monthly > 0 || c.hourly > 0) return "NEEDS MANUAL ANNUAL ⚠";
  return "UNPRICED";
}

function changes(c: BasisCell): string {
  const cur = currentWinner(c);
  const next = newWinner(c);
  if (cur === next) return "";
  if (next === "NEEDS MANUAL ANNUAL ⚠") return "⚠ BLOCKER";
  if (cur === "DAY_RATE (flat/day)") return "⚠ BILLING CHANGES";
  if (cur === "MONTHLY" && next === "ANNUAL_RATE") return "value-neutral if annual=monthly×12";
  return "review";
}

async function main(): Promise<void> {
  const accounts = await prisma.clientAccount.findMany({
    include: {
      org: { select: { name: true } },
      accountRates: { include: { rateSubCategory: true, sla: true } },
      assignments: {
        where: { rateCategory: "DEDICATED" },
        include: { technician: true },
      },
    },
    orderBy: { name: "asc" },
  });

  const annualSubcat = await prisma.rateSubCategory.findUnique({
    where: { rateCategory_code: { rateCategory: "DEDICATED", code: "ANNUAL_RATE" } },
    select: { id: true },
  });
  if (BACKFILL && !annualSubcat) {
    throw new Error("ANNUAL_RATE sub-category not found — cannot backfill.");
  }

  console.log(`=== DEDICATED BASIS AUDIT (current vs annual-only)${BACKFILL ? " — BACKFILL MODE" : ""} ===\n`);

  for (const account of accounts) {
    const dedicatedRates = account.accountRates.filter(
      (r) => r.rateSubCategory.rateCategory === "DEDICATED",
    );
    if (dedicatedRates.length === 0 && account.assignments.length === 0) continue;

    console.log(`ACCOUNT: ${account.org.name} / ${account.name}`);

    // Group by (band, tier).
    const cells = new Map<string, BasisCell>();
    const slaIdByKey = new Map<string, string>();
    for (const r of dedicatedRates) {
      const key = `${r.band}|${r.sla.code}`;
      slaIdByKey.set(key, r.slaId);
      const cell = cells.get(key) ?? { annual: 0, day: 0, monthly: 0, hourly: 0, legacyHourly: 0 };
      const amount = num(r.rateAmount);
      if (amount <= 0) continue;
      const code = r.rateSubCategory.code;
      const next = { ...cell };
      if (code === "ANNUAL_RATE") next.annual = amount;
      else if (code === "DAY_RATE") next.day = amount;
      else if (code === "MONTHLY") next.monthly = amount;
      else if (code === "HOURLY") next.hourly = amount;
      else if (code === "MONTHLY_DAY_RATE" || code === "ANNUAL_BACKFILL") next.legacyHourly = amount;
      else continue; // OT / weekend / others — not a basis
      cells.set(key, next);
    }

    if (cells.size === 0) {
      console.log("  (no dedicated basis rates stored)");
    } else {
      for (const [key, c] of [...cells.entries()].sort()) {
        const [band, tier] = key.split("|");
        const flag = changes(c);
        console.log(
          `  Band ${band} ${tier.padEnd(12)} annual=${c.annual || "—"} day=${c.day || "—"} ` +
            `monthly=${c.monthly || "—"} hourly=${c.hourly || "—"} legacy=${c.legacyHourly || "—"}`,
        );
        console.log(
          `    now → ${currentWinner(c).padEnd(22)} after → ${newWinner(c).padEnd(22)} ${flag}`,
        );

        // Backfill: derive ANNUAL_RATE where it is blank but monthly/hourly exist.
        // Flat day-rate-only cells are intentionally never derived.
        if (BACKFILL && annualSubcat && c.annual <= 0 && (c.monthly > 0 || c.hourly > 0)) {
          const derived = c.monthly > 0 ? c.monthly * 12 : c.hourly * ANNUAL_WORK_HOURS;
          const source = c.monthly > 0 ? `MONTHLY ${c.monthly} × 12` : `HOURLY ${c.hourly} × ${ANNUAL_WORK_HOURS}`;
          const slaId = slaIdByKey.get(key);
          if (!slaId) {
            console.log(`    BACKFILL SKIPPED — no slaId resolved for ${key}`);
            continue;
          }
          await prisma.accountRate.upsert({
            where: {
              clientAccountId_rateSubCategoryId_band_slaId_effectiveFrom: {
                clientAccountId: account.id,
                rateSubCategoryId: annualSubcat.id,
                band: Number(band),
                slaId,
                effectiveFrom: ALWAYS_ACTIVE_FROM,
              },
            },
            create: {
              clientAccountId: account.id,
              rateSubCategoryId: annualSubcat.id,
              band: Number(band),
              slaId,
              rateAmount: new Prisma.Decimal(derived),
              effectiveFrom: ALWAYS_ACTIVE_FROM,
              notes: `Backfilled for annual-only cutover (${source})`,
            },
            update: { rateAmount: new Prisma.Decimal(derived) },
          });
          console.log(`    BACKFILLED ANNUAL_RATE = ${derived} (${source})`);
        }
      }
    }

    // Per-tech flags on this account's dedicated assignments.
    for (const a of account.assignments) {
      const t = a.technician;
      const flags: string[] = [];
      if (t.dedicatedBillingBasis === "HOURLY") flags.push("HOURLY basis → flips to annual-day model");
      if (t.isRebadged && num(t.annualSalary) <= 0) {
        const fallbacks: string[] = [];
        if (num(t.rebadgedDayRate) > 0) fallbacks.push(`day=${num(t.rebadgedDayRate)}`);
        if (num(t.rebadgedMonthlyRate) > 0) fallbacks.push(`monthly=${num(t.rebadgedMonthlyRate)}`);
        if (num(t.rebadgedHourlyRate) > 0) fallbacks.push(`hourly=${num(t.rebadgedHourlyRate)}`);
        flags.push(`REBADGED no annualSalary (${fallbacks.join(", ") || "no rates at all"}) → would be UNPRICED ⚠`);
      }
      if (num(t.annualSalary) > 0 && !t.isRebadged) {
        flags.push(`per-tech annual=${num(t.annualSalary)} (overrides band — unchanged)`);
      }
      if (flags.length > 0) {
        console.log(`  TECH ${t.firstName} ${t.lastName} (band ${t.band}${t.isRebadged ? ", rebadged" : ""}): ${flags.join(" | ")}`);
      }
    }
    console.log("");
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
