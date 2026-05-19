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
];

type SubCatSeed = {
  rateCategory: RateCategory;
  code: string;
  label: string;
  sortOrder: number;
  isOvertimeVariant?: boolean;
};

const subCategorySeeds: SubCatSeed[] = [
  // DISPATCH_SCHED — always Band 2 in practice; the rate sheet still lets you pick band.
  { rateCategory: RateCategory.DISPATCH_SCHED, code: "FIRST_HOUR", label: "First Hour Rate", sortOrder: 10 },
  { rateCategory: RateCategory.DISPATCH_SCHED, code: "ADDITIONAL_HOUR", label: "Additional Hour Rate", sortOrder: 20 },
  { rateCategory: RateCategory.DISPATCH_SCHED, code: "OUT_OF_OFFICE", label: "Out of Office Hours", sortOrder: 30, isOvertimeVariant: true },
  { rateCategory: RateCategory.DISPATCH_SCHED, code: "WEEKEND", label: "Weekend", sortOrder: 40, isOvertimeVariant: true },
  { rateCategory: RateCategory.DISPATCH_SCHED, code: "SCHEDULED_FULL_DAY", label: "Scheduled Visit (Full day)", sortOrder: 50 },
  { rateCategory: RateCategory.DISPATCH_SCHED, code: "SCHEDULED_HALF_DAY", label: "Scheduled Visit (Half day)", sortOrder: 60 },

  // PROJECT_TM — bands 1/2/3, SLA = NA.
  { rateCategory: RateCategory.PROJECT_TM, code: "FULL_DAY", label: "Full Day Rate", sortOrder: 10 },
  { rateCategory: RateCategory.PROJECT_TM, code: "HALF_DAY", label: "Half Day Rate", sortOrder: 20 },
  { rateCategory: RateCategory.PROJECT_TM, code: "WEEKLY", label: "Weekly Rate", sortOrder: 30 },
  { rateCategory: RateCategory.PROJECT_TM, code: "MONTHLY", label: "Monthly Rate", sortOrder: 40 },

  // DEDICATED — bands 0..4, SLA = NA.
  { rateCategory: RateCategory.DEDICATED, code: "ANNUAL_BACKFILL", label: "Annual With Backfill", sortOrder: 10 },
  { rateCategory: RateCategory.DEDICATED, code: "HOURLY_BACKFILL", label: "Hourly With Backfill", sortOrder: 20 },
  { rateCategory: RateCategory.DEDICATED, code: "HOURLY_BACKFILL_OT", label: "Hourly With Backfill OT", sortOrder: 30, isOvertimeVariant: true },
  { rateCategory: RateCategory.DEDICATED, code: "HOURLY_BACKFILL_WEEKEND", label: "Hourly With Backfill Weekend", sortOrder: 40, isOvertimeVariant: true },
  { rateCategory: RateCategory.DEDICATED, code: "REBADGED", label: "Rebadged", sortOrder: 50 },
  { rateCategory: RateCategory.DEDICATED, code: "REBADGED_HOURLY", label: "Rebadged Hourly", sortOrder: 60 },
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
