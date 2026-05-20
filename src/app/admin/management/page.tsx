import { prisma } from "@/lib/db";
import { ManagementView, type OrgRow } from "./management-view";

export default async function ManagementPage() {
  const data = await prisma.org.findMany({
    orderBy: { name: "asc" },
    include: {
      clientAccounts: {
        orderBy: { name: "asc" },
        include: {
          _count: {
            select: {
              accountRates: true,
              miscFees: true,
              assignments: true,
              invoiceRuns: true,
            },
          },
        },
      },
      technicians: {
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        include: {
          _count: { select: { assignments: true } },
        },
      },
    },
  });

  const orgs: OrgRow[] = data.map((o) => ({
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
      invoiceRunCount: a._count.invoiceRuns,
    })),
    technicians: o.technicians.map((t) => ({
      id: t.id,
      firstName: t.firstName,
      lastName: t.lastName,
      primaryCategory: t.primaryCategory,
      band: t.band,
      assignmentCount: t._count.assignments,
    })),
  }));

  return (
    <div className="flex flex-col gap-8 animate-fade-in">
      <header className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-accent">
          Management
        </span>
        <h1 className="text-4xl font-semibold tracking-tighter2">Org · Account · Technician</h1>
        <p className="max-w-2xl text-sm text-fg-muted">
          One view across orgs, their client accounts, and the technicians they employ. Search,
          expand, and delete with guardrails. Orgs need zero accounts and zero techs; accounts
          need zero assignments and invoice runs; techs need zero assignments.
        </p>
      </header>

      <ManagementView orgs={orgs} />
    </div>
  );
}
