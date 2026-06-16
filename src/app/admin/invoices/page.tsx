import { prisma } from "@/lib/db";
import { AccountCardGrid } from "@/components/admin/account-card-grid";

export default async function InvoicesLanding() {
  const accounts = await prisma.clientAccount.findMany({
    orderBy: { name: "asc" },
    include: {
      org: { select: { name: true } },
      _count: { select: { invoiceRuns: true, assignments: true } },
    },
  });

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <header className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.25em] text-accent">
          Workspace
        </span>
        <h1 className="text-3xl font-semibold tracking-tighter2 sm:text-4xl">Invoices</h1>
        <p className="max-w-2xl text-sm text-fg-muted">
          Open an account to preview each category for the month (FTE, Project / T&amp;M,
          Dispatch) and download them on their own or as one combined workbook.
        </p>
      </header>

      <AccountCardGrid
        placeholder="Search accounts by name or client…"
        accounts={accounts.map((a) => ({
          id: a.id,
          orgName: a.org.name,
          name: a.name,
          href: `/admin/invoices/generate/${a.id}/combined`,
          metaLine: `${a._count.assignments} assignment${a._count.assignments === 1 ? "" : "s"} · ${a._count.invoiceRuns} run${a._count.invoiceRuns === 1 ? "" : "s"}`,
        }))}
      />
    </div>
  );
}
