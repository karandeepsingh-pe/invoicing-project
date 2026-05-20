import { prisma } from "@/lib/db";
import { CommercialsView, type CommercialOrg } from "./commercials-view";

export default async function CommercialsPage() {
  const data = await prisma.org.findMany({
    orderBy: { name: "asc" },
    include: {
      clientAccounts: {
        orderBy: { name: "asc" },
        include: {
          _count: {
            select: { accountRates: true, miscFees: true, assignments: true },
          },
        },
      },
    },
  });

  const orgs: CommercialOrg[] = data.map((o) => ({
    id: o.id,
    name: o.name,
    outputTemplate: o.outputTemplate,
    defaultCurrency: o.defaultCurrency,
    accounts: o.clientAccounts.map((a) => ({
      id: a.id,
      name: a.name,
      currency: a.currency ?? o.defaultCurrency,
      rateCount: a._count.accountRates,
      miscCount: a._count.miscFees,
      assignmentCount: a._count.assignments,
    })),
  }));

  return (
    <div className="flex flex-col gap-8 animate-fade-in">
      <header className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-accent">Pricing</span>
        <h1 className="text-4xl font-semibold tracking-tighter2">Commercials</h1>
        <p className="max-w-2xl text-sm text-fg-muted">
          Set rates and miscellaneous fees per client account. Pick an account to open its rate
          sheet.
        </p>
      </header>

      <CommercialsView orgs={orgs} />
    </div>
  );
}
