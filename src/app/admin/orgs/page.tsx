import { prisma } from "@/lib/db";
import { OrgCreateDialog } from "./create-dialog";
import { OrgsGrid, type OrgCard } from "./orgs-grid";

export default async function OrgsPage() {
  const rows = await prisma.org.findMany({
    include: { _count: { select: { clientAccounts: true, technicians: true } } },
    orderBy: { name: "asc" },
  });

  const orgs: OrgCard[] = rows.map((o) => ({
    id: o.id,
    name: o.name,
    outputTemplate: o.outputTemplate,
    defaultCurrency: o.defaultCurrency,
    accountCount: o._count.clientAccounts,
    technicianCount: o._count.technicians,
  }));

  return (
    <div className="flex flex-col gap-8 animate-fade-in">
      <header className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.25em] text-accent">Workspace</span>
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-3xl font-semibold tracking-tighter2 sm:text-4xl">Clients</h1>
          <div className="flex items-center gap-3">
            <span className="text-sm text-fg-subtle">{orgs.length} total</span>
            <OrgCreateDialog />
          </div>
        </div>
        <p className="max-w-2xl text-sm text-fg-muted">
          Vendor partners that own accounts. HCL gets the FSO format. Everyone else gets
          Pre-Invoice.
        </p>
      </header>

      <OrgsGrid orgs={orgs} />
    </div>
  );
}
