import { prisma } from "@/lib/db";
import { AccountsView, type AccountCard } from "./accounts-view";
import { ClientAccountCreateDialog } from "./create-dialog";
import { BulkUploadDialog } from "./bulk-upload-dialog";

export default async function AccountsPage() {
  const [orgs, accounts] = await Promise.all([
    prisma.org.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, defaultCurrency: true },
    }),
    prisma.clientAccount.findMany({
      orderBy: { name: "asc" },
      include: {
        org: {
          select: {
            id: true,
            name: true,
            defaultCurrency: true,
            outputTemplate: true,
          },
        },
        _count: {
          select: {
            accountRates: true,
            miscFees: true,
            assignments: true,
            invoiceRuns: true,
          },
        },
      },
    }),
  ]);

  const cards: AccountCard[] = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    currency: a.currency,
    orgId: a.org.id,
    orgName: a.org.name,
    orgDefaultCurrency: a.org.defaultCurrency,
    outputTemplate: a.org.outputTemplate,
    rateCount: a._count.accountRates,
    miscCount: a._count.miscFees,
    assignmentCount: a._count.assignments,
    invoiceRunCount: a._count.invoiceRuns,
    clientPocName: a.clientPocName,
    clientSpocEmail: a.clientSpocEmail,
    projectDescription: a.projectDescription,
    defaultHours: a.defaultHours,
    addressLine1: a.addressLine1,
    city: a.city,
    state: a.state,
    postalCode: a.postalCode,
    country: a.country,
    dispatchPricingModel: a.dispatchPricingModel,
    businessHoursStart: a.businessHoursStart,
    businessHoursEnd: a.businessHoursEnd,
  }));

  return (
    <div className="flex flex-col gap-8 animate-fade-in">
      <header className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-accent">Workspace</span>
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-4xl font-semibold tracking-tighter2">Accounts</h1>
          <div className="flex items-center gap-3">
            <span className="text-sm text-fg-subtle">{cards.length} total</span>
            <BulkUploadDialog />
            {orgs.length > 0 && <ClientAccountCreateDialog orgs={orgs} />}
          </div>
        </div>
        <p className="max-w-2xl text-sm text-fg-muted">
          Client billing units owned by orgs. Each account holds a rate sheet, misc fees, and the
          technicians assigned to it.
        </p>
      </header>

      <AccountsView accounts={cards} />
    </div>
  );
}
