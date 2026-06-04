import Link from "next/link";
import { prisma } from "@/lib/db";

export default async function InvoicesLanding() {
  const accounts = await prisma.clientAccount.findMany({
    orderBy: [{ org: { name: "asc" } }, { name: "asc" }],
    include: {
      org: { select: { name: true } },
      _count: { select: { invoiceRuns: true, assignments: true } },
    },
  });

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <header className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-accent">
          Workspace
        </span>
        <h1 className="text-4xl font-semibold tracking-tighter2">Invoices</h1>
        <p className="max-w-2xl text-sm text-fg-muted">
          Open any account to preview every category (FTE, Project / T&amp;M,
          Dispatch) for the month and download each — or the combined workbook.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {accounts.map((a) => (
          <Link
            key={a.id}
            href={`/admin/invoices/generate/${a.id}/combined` as never}
            className="glass group flex flex-col gap-2 rounded-xl p-4 transition-all hover:-translate-y-0.5"
          >
            <span className="text-xs text-fg-subtle">{a.org.name}</span>
            <span className="text-base font-semibold tracking-tightish text-fg group-hover:text-accent">
              {a.name}
            </span>
            <span className="text-[11px] text-fg-subtle">
              {a._count.assignments} assignment{a._count.assignments === 1 ? "" : "s"} ·{" "}
              {a._count.invoiceRuns} run{a._count.invoiceRuns === 1 ? "" : "s"}
            </span>
          </Link>
        ))}
        {accounts.length === 0 && (
          <p className="col-span-full text-sm text-fg-subtle">No accounts yet.</p>
        )}
      </div>
    </div>
  );
}
