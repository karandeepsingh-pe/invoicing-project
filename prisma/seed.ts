import {
  PrismaClient,
  OutputTemplate,
  UserRole,
  RateCategory,
} from "@prisma/client";

const prisma = new PrismaClient();

type OrgSeed = {
  name: string;
  outputTemplate: OutputTemplate;
  accounts: string[];
};

const orgSeeds: OrgSeed[] = [
  { name: "HCL", outputTemplate: OutputTemplate.FSO, accounts: ["ZF", "Acadia"] },
  { name: "Cognizant", outputTemplate: OutputTemplate.PRE_INVOICE, accounts: [] },
  { name: "TCS", outputTemplate: OutputTemplate.PRE_INVOICE, accounts: ["TCS"] },
  { name: "Wipro", outputTemplate: OutputTemplate.PRE_INVOICE, accounts: ["Wipro"] },
  { name: "Hiscox", outputTemplate: OutputTemplate.PRE_INVOICE, accounts: ["Hiscox"] },
  { name: "EverSource", outputTemplate: OutputTemplate.PRE_INVOICE, accounts: ["EverSource"] },
  { name: "JLL", outputTemplate: OutputTemplate.PRE_INVOICE, accounts: ["JLL"] },
  { name: "MAS NJ", outputTemplate: OutputTemplate.PRE_INVOICE, accounts: ["MAS_NJ"] },
];

const slaSeeds: { code: string; label: string; sortOrder: number }[] = [
  { code: "NBD", label: "Next Business Day", sortOrder: 10 },
  { code: "SBD", label: "Same Business Day", sortOrder: 20 },
  { code: "2BD", label: "2 Business Days", sortOrder: 30 },
  { code: "3BD", label: "3 Business Days", sortOrder: 40 },
  { code: "9X5X4", label: "9x5x4 (Same business day within 4 hours)", sortOrder: 50 },
  { code: "24X7X4", label: "24x7x4 (24/7 within 4 hours)", sortOrder: 60 },
  { code: "SCHEDULE", label: "Scheduled", sortOrder: 70 },
  { code: "NA", label: "Not applicable", sortOrder: 99 },
  // Band-SLA / rate-tier codes for DEDICATED rate rows.
  { code: "BACKFILL", label: "Backfill (replacement guaranteed)", sortOrder: 100 },
  { code: "NO_BACKFILL", label: "No Backfill", sortOrder: 110 },
];

type SubCatSeed = {
  rateCategory: RateCategory;
  code: string;
  label: string;
  sortOrder: number;
  isOvertimeVariant?: boolean;
};

const subCategorySeeds: SubCatSeed[] = [
  // DISPATCH_SCHED — reactive dispatch visits. Always Band 2 in practice; the rate
  // sheet still lets you pick band. PER_TICKET is the flat per-visit override.
  // Per-visit charge = FIRST_HOUR (by SLA) + (hours-1) x ADDITIONAL_HOUR (T&M),
  // capped at FULL_DAY, then x the OOBH / Weekend-PH multiplier when applicable.
  { rateCategory: RateCategory.DISPATCH_SCHED, code: "PER_TICKET", label: "Per Ticket (flat)", sortOrder: 5 },
  { rateCategory: RateCategory.DISPATCH_SCHED, code: "FIRST_HOUR", label: "First Hour Rate (by SLA)", sortOrder: 10 },
  { rateCategory: RateCategory.DISPATCH_SCHED, code: "ADDITIONAL_HOUR", label: "T&M Hourly Rate", sortOrder: 20 },
  { rateCategory: RateCategory.DISPATCH_SCHED, code: "FULL_DAY", label: "Full Day (per-visit cap)", sortOrder: 30 },
  { rateCategory: RateCategory.DISPATCH_SCHED, code: "OOBH_MULTIPLIER", label: "OOBH Multiplier (e.g. 1.5)", sortOrder: 40, isOvertimeVariant: true },
  { rateCategory: RateCategory.DISPATCH_SCHED, code: "WEEKEND_PH_MULTIPLIER", label: "Weekend / PH Multiplier (e.g. 2.0)", sortOrder: 50, isOvertimeVariant: true },

  // SCHEDULED — scheduled visits billed per day off the timesheet (no monthly cap).
  { rateCategory: RateCategory.SCHEDULED, code: "FULL_DAY", label: "Full Day Rate", sortOrder: 10 },
  { rateCategory: RateCategory.SCHEDULED, code: "HALF_DAY", label: "Half Day Rate", sortOrder: 20 },

  // PROJECT_TM — bands 1/2/3, SLA = NA.
  { rateCategory: RateCategory.PROJECT_TM, code: "FULL_DAY", label: "Full Day Rate", sortOrder: 10 },
  { rateCategory: RateCategory.PROJECT_TM, code: "HALF_DAY", label: "Half Day Rate", sortOrder: 20 },
  { rateCategory: RateCategory.PROJECT_TM, code: "WEEKLY", label: "Weekly Rate", sortOrder: 30 },
  { rateCategory: RateCategory.PROJECT_TM, code: "MONTHLY", label: "Monthly Rate", sortOrder: 40 },

  // DEDICATED — bands 0..4. Tier-neutral codes; the Backfill / No Backfill
  // distinction rides on AccountRate.slaId (BACKFILL vs NO_BACKFILL Sla code).
  { rateCategory: RateCategory.DEDICATED, code: "MONTHLY_DAY_RATE", label: "Hourly Rate", sortOrder: 10 },
  // Annual rate basis: stores the annual figure; day rate = annual / 260.
  { rateCategory: RateCategory.DEDICATED, code: "ANNUAL_RATE", label: "Annual Rate", sortOrder: 15 },
  { rateCategory: RateCategory.DEDICATED, code: "HOURLY_BACKFILL", label: "Hourly With Backfill", sortOrder: 20 },
  { rateCategory: RateCategory.DEDICATED, code: "OT_HOURLY_RATE", label: "OT Hourly Rate", sortOrder: 30, isOvertimeVariant: true },
  { rateCategory: RateCategory.DEDICATED, code: "WEEKEND_HOURLY_RATE", label: "Weekend Hourly Rate", sortOrder: 40, isOvertimeVariant: true },
  { rateCategory: RateCategory.DEDICATED, code: "REBADGED", label: "Rebadged", sortOrder: 50 },
  { rateCategory: RateCategory.DEDICATED, code: "REBADGED_HOURLY", label: "Rebadged Hourly", sortOrder: 60 },
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
  for (const seed of orgSeeds) {
    const org = await prisma.org.upsert({
      where: { name: seed.name },
      update: { outputTemplate: seed.outputTemplate },
      create: { name: seed.name, outputTemplate: seed.outputTemplate },
    });

    for (const accountName of seed.accounts) {
      await prisma.clientAccount.upsert({
        where: { orgId_name: { orgId: org.id, name: accountName } },
        update: {},
        create: { orgId: org.id, name: accountName },
      });
    }
  }

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
