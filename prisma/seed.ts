import { PrismaClient, OutputTemplate, UserRole } from "@prisma/client";

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
