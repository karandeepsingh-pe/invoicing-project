import { PrismaClient, UserRole, RateCategory } from "@prisma/client";

const prisma = new PrismaClient();

const slaSeeds: { code: string; label: string; sortOrder: number }[] = [
  // Dispatch on-site response SLAs (drive the dispatch rate matrix columns).
  { code: "24X7X4", label: "24x7x4 (4 Hrs) — 4 hrs on-site response, 24x7", sortOrder: 10 },
  { code: "24X7X8", label: "24x7x8 — same-day on-site response, 24x7", sortOrder: 20 },
  { code: "8X5X4", label: "8x5x4 — 4 hrs on-site response, business hours", sortOrder: 30 },
  { code: "8X5X6", label: "8x5x6 — 6 hrs on-site response, business hours", sortOrder: 40 },
  { code: "9X5X4", label: "9x5x4 — same business day within 4 hours (legacy)", sortOrder: 45 },
  { code: "NBD", label: "Next Business Day (NBD)", sortOrder: 50 },
  { code: "SBD", label: "Same Business Day (SBD)", sortOrder: 60 },
  { code: "2BD", label: "2 Business Days", sortOrder: 70 },
  { code: "3BD", label: "3 Business Days", sortOrder: 80 },
  { code: "4BD", label: "4 Business Days", sortOrder: 90 },
  { code: "5BD", label: "5 Business Days", sortOrder: 100 },
  { code: "6BD", label: "6 Business Days", sortOrder: 110 },
  { code: "7BD", label: "7 Business Days", sortOrder: 120 },
  { code: "8BD", label: "8 Business Days", sortOrder: 130 },
  { code: "9BD", label: "9 Business Days", sortOrder: 140 },
  { code: "10BD", label: "10 Business Days", sortOrder: 150 },
  { code: "11BD", label: "11 Business Days", sortOrder: 160 },
  { code: "12BD", label: "12 Business Days", sortOrder: 170 },
  { code: "13BD", label: "13 Business Days", sortOrder: 180 },
  { code: "14BD", label: "14 Business Days", sortOrder: 190 },
  { code: "15BD", label: "15 Business Days", sortOrder: 200 },
  // Priority tiers for the TCS-style dispatch model (the SLA dimension carries the
  // priority that keys the first-hour charge). MACd = Move/Add/Change dispatch.
  { code: "P1", label: "Priority 1 (P1)", sortOrder: 300 },
  { code: "P2", label: "Priority 2 (P2)", sortOrder: 310 },
  { code: "P3", label: "Priority 3 (P3)", sortOrder: 320 },
  { code: "P4", label: "Priority 4 (P4)", sortOrder: 330 },
  { code: "MACD", label: "MACd (Move / Add / Change)", sortOrder: 340 },
  // Non-dispatch dimension codes.
  { code: "SCHEDULE", label: "Scheduled", sortOrder: 500 },
  { code: "NA", label: "Not applicable", sortOrder: 900 },
  // Rate-tier codes for DEDICATED rate rows (backfill is a tier, not a subcategory).
  { code: "BACKFILL", label: "Backfill (replacement guaranteed)", sortOrder: 910 },
  { code: "NO_BACKFILL", label: "No Backfill", sortOrder: 920 },
];

type SubCatSeed = {
  rateCategory: RateCategory;
  code: string;
  label: string;
  sortOrder: number;
  isOvertimeVariant?: boolean;
};

const subCategorySeeds: SubCatSeed[] = [
  // DISPATCH_SCHED — reactive dispatch visits, flat per SLA (stored at Band 2).
  // Explicit per-scenario rates: BUSINESS (FIRST_HOUR / ADDITIONAL_HOUR),
  // OUT-OF-BUSINESS (*_OOB), WEEKEND (*_WEEKEND); per-ticket flats for business /
  // OOB; FULL_DAY cap; HALF_DAY. Legacy PER_TICKET + OOBH/Weekend multipliers kept
  // so accounts priced the old way still resolve (calc falls back to them).
  { rateCategory: RateCategory.DISPATCH_SCHED, code: "FIRST_HOUR", label: "First Hour (Business)", sortOrder: 10 },
  { rateCategory: RateCategory.DISPATCH_SCHED, code: "ADDITIONAL_HOUR", label: "Additional Hour (Business)", sortOrder: 20 },
  { rateCategory: RateCategory.DISPATCH_SCHED, code: "FIRST_HOUR_OOB", label: "First Hour (Out of Business)", sortOrder: 30 },
  { rateCategory: RateCategory.DISPATCH_SCHED, code: "ADDITIONAL_HOUR_OOB", label: "Additional Hour (Out of Business)", sortOrder: 40 },
  { rateCategory: RateCategory.DISPATCH_SCHED, code: "FIRST_HOUR_WEEKEND", label: "First Hour (Weekend)", sortOrder: 50 },
  { rateCategory: RateCategory.DISPATCH_SCHED, code: "ADDITIONAL_HOUR_WEEKEND", label: "Additional Hour (Weekend)", sortOrder: 60 },
  { rateCategory: RateCategory.DISPATCH_SCHED, code: "ADDITIONAL_HOUR_WEEKEND_OOB", label: "Additional Hour (Weekend After Hours)", sortOrder: 65 },
  { rateCategory: RateCategory.DISPATCH_SCHED, code: "PER_TICKET_BUSINESS", label: "Per Ticket Business Hours (Flat)", sortOrder: 70 },
  { rateCategory: RateCategory.DISPATCH_SCHED, code: "PER_TICKET_OOB", label: "Per Ticket Out of Business Hours (Flat)", sortOrder: 80 },
  { rateCategory: RateCategory.DISPATCH_SCHED, code: "HALF_DAY", label: "Half Day", sortOrder: 90 },
  { rateCategory: RateCategory.DISPATCH_SCHED, code: "FULL_DAY", label: "Full Day", sortOrder: 100 },
  // Legacy dispatch codes (fallback path).
  { rateCategory: RateCategory.DISPATCH_SCHED, code: "PER_TICKET", label: "Per Ticket (flat, legacy)", sortOrder: 200 },
  { rateCategory: RateCategory.DISPATCH_SCHED, code: "OOBH_MULTIPLIER", label: "OOBH Multiplier (legacy, e.g. 1.5)", sortOrder: 210, isOvertimeVariant: true },
  { rateCategory: RateCategory.DISPATCH_SCHED, code: "WEEKEND_PH_MULTIPLIER", label: "Weekend / PH Multiplier (legacy, e.g. 2.0)", sortOrder: 220, isOvertimeVariant: true },

  // SCHEDULED — scheduled visits billed per day off the timesheet (no monthly cap).
  { rateCategory: RateCategory.SCHEDULED, code: "FULL_DAY", label: "Full Day", sortOrder: 10 },
  { rateCategory: RateCategory.SCHEDULED, code: "HALF_DAY", label: "Half Day", sortOrder: 20 },
  { rateCategory: RateCategory.SCHEDULED, code: "FULL_DAY_WEEKEND", label: "Full Day (Weekend)", sortOrder: 30 },
  { rateCategory: RateCategory.SCHEDULED, code: "HALF_DAY_WEEKEND", label: "Half Day (Weekend)", sortOrder: 40 },
  { rateCategory: RateCategory.SCHEDULED, code: "HOURLY_BUSINESS", label: "Hourly (Business Hours)", sortOrder: 50 },
  { rateCategory: RateCategory.SCHEDULED, code: "HOURLY_OOB", label: "Hourly (Out of Business)", sortOrder: 60 },
  { rateCategory: RateCategory.SCHEDULED, code: "HOURLY_WEEKEND", label: "Hourly (Weekend)", sortOrder: 70 },

  // PROJECT_TM — per-day / weekly / monthly; weekend day variants; hourly variants.
  { rateCategory: RateCategory.PROJECT_TM, code: "FULL_DAY", label: "Full Day", sortOrder: 10 },
  { rateCategory: RateCategory.PROJECT_TM, code: "HALF_DAY", label: "Half Day", sortOrder: 20 },
  { rateCategory: RateCategory.PROJECT_TM, code: "FULL_DAY_WEEKEND", label: "Full Day (Weekend)", sortOrder: 30 },
  { rateCategory: RateCategory.PROJECT_TM, code: "HALF_DAY_WEEKEND", label: "Half Day (Weekend)", sortOrder: 40 },
  { rateCategory: RateCategory.PROJECT_TM, code: "HOURLY_BUSINESS", label: "Hourly (Business Hours)", sortOrder: 50 },
  { rateCategory: RateCategory.PROJECT_TM, code: "HOURLY_OOB", label: "Hourly (Out of Business)", sortOrder: 60 },
  { rateCategory: RateCategory.PROJECT_TM, code: "HOURLY_WEEKEND", label: "Hourly (Weekend)", sortOrder: 70 },
  { rateCategory: RateCategory.PROJECT_TM, code: "WEEKLY", label: "Weekly Rate", sortOrder: 80 },
  { rateCategory: RateCategory.PROJECT_TM, code: "MONTHLY", label: "Monthly Rate", sortOrder: 90 },
  { rateCategory: RateCategory.PROJECT_TM, code: "MONTHLY_SHORT", label: "Monthly (Short Term)", sortOrder: 100 },
  { rateCategory: RateCategory.PROJECT_TM, code: "MONTHLY_LONG", label: "Monthly (Long Term)", sortOrder: 110 },

  // DEDICATED — bands 0..4. Tier-neutral base codes; the Backfill / No Backfill
  // distinction rides on AccountRate.slaId (BACKFILL vs NO_BACKFILL Sla code).
  // Only the codes fte-rows.ts actually reads are kept: the day-rate basis
  // (Annual / Day / Monthly — priority Day > Annual > Monthly) + the per-hour
  // OT / Weekend adders. Rebadged* are per-technician (Technician.rebadged*
  // columns), billed off salary — NOT rate-sheet rows.
  // HOURLY basis: regular hours × this rate (used when the account's
  // dedicatedBillingBasis = HOURLY). Annual/Day/Monthly are the day-rate basis.
  { rateCategory: RateCategory.DEDICATED, code: "HOURLY", label: "Hourly Rate", sortOrder: 5 },
  { rateCategory: RateCategory.DEDICATED, code: "ANNUAL_RATE", label: "Annual Rate", sortOrder: 10 },
  { rateCategory: RateCategory.DEDICATED, code: "DAY_RATE", label: "Day Rate", sortOrder: 12 },
  { rateCategory: RateCategory.DEDICATED, code: "MONTHLY", label: "Monthly Rate", sortOrder: 14 },
  { rateCategory: RateCategory.DEDICATED, code: "OT_HOURLY_RATE", label: "OT Hourly Rate", sortOrder: 30, isOvertimeVariant: true },
  { rateCategory: RateCategory.DEDICATED, code: "WEEKEND_HOURLY_RATE", label: "Weekend Hourly Rate", sortOrder: 40, isOvertimeVariant: true },
];

const visitTypeSeeds: { code: string; label: string; sortOrder: number }[] = [
  { code: "INSTALL", label: "Install", sortOrder: 10 },
  { code: "REPAIR", label: "Repair", sortOrder: 20 },
  { code: "AUDIT", label: "Audit", sortOrder: 30 },
  { code: "SURVEY", label: "Survey", sortOrder: 40 },
  { code: "MAINTENANCE", label: "Maintenance", sortOrder: 50 },
  { code: "DECOMMISSION", label: "Decommission", sortOrder: 60 },
  { code: "OTHER", label: "Other", sortOrder: 99 },
];

async function main() {
  // Masters only. No sample orgs / accounts / technicians are seeded — real
  // orgs and accounts are created by the admin in the app, or imported via the
  // bulk Excel upload on the Accounts page.
  for (const sla of slaSeeds) {
    await prisma.sla.upsert({
      where: { code: sla.code },
      update: { label: sla.label, sortOrder: sla.sortOrder },
      create: sla,
    });
  }

  for (const sub of subCategorySeeds) {
    await prisma.rateSubCategory.upsert({
      where: { rateCategory_code: { rateCategory: sub.rateCategory, code: sub.code } },
      update: {
        label: sub.label,
        sortOrder: sub.sortOrder,
        isOvertimeVariant: sub.isOvertimeVariant ?? false,
      },
      create: {
        rateCategory: sub.rateCategory,
        code: sub.code,
        label: sub.label,
        sortOrder: sub.sortOrder,
        isOvertimeVariant: sub.isOvertimeVariant ?? false,
      },
    });
  }

  for (const vt of visitTypeSeeds) {
    await prisma.dispatchVisitType.upsert({
      where: { code: vt.code },
      update: { label: vt.label, sortOrder: vt.sortOrder },
      create: vt,
    });
  }

  // Example 2026 gazetted holidays (global). Idempotent on date.
  const holidaySeeds: { date: string; name: string }[] = [
    { date: "2026-01-01", name: "New Year's Day" },
    { date: "2026-05-01", name: "Labour Day" },
    { date: "2026-12-25", name: "Christmas" },
  ];
  for (const h of holidaySeeds) {
    const date = new Date(`${h.date}T00:00:00.000Z`);
    await prisma.holiday.upsert({
      where: { date },
      update: { name: h.name },
      create: { date, name: h.name },
    });
  }

  await prisma.user.upsert({
    where: { email: "admin@ovationwps.com" },
    update: { role: UserRole.ADMIN },
    create: {
      email: "admin@ovationwps.com",
      name: "Admin",
      role: UserRole.ADMIN,
    },
  });

  const counts = {
    orgs: await prisma.org.count(),
    clientAccounts: await prisma.clientAccount.count(),
    slas: await prisma.sla.count(),
    rateSubCategories: await prisma.rateSubCategory.count(),
    dispatchVisitTypes: await prisma.dispatchVisitType.count(),
    holidays: await prisma.holiday.count(),
    users: await prisma.user.count(),
  };
  console.log("Seed complete:", counts);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
