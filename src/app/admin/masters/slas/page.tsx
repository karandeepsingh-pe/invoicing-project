import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { SlaRowActions } from "./sla-row";
import { SlaCreateDialog } from "./create-dialog";

export default async function SlasMastersPage() {
  await requireAdmin();
  const slas = await prisma.sla.findMany({
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    include: { _count: { select: { accountRates: true } } },
  });

  return (
    <div className="flex flex-col gap-8 animate-fade-in">
      <header className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.25em] text-accent">Masters</span>
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-3xl font-semibold tracking-tighter2 sm:text-4xl">SLAs</h1>
          <div className="flex items-center gap-3">
            <span className="text-sm text-fg-subtle">{slas.length} total</span>
            <SlaCreateDialog />
          </div>
        </div>
        <p className="max-w-2xl text-sm text-fg-muted">
          Service-level codes used on every rate row. Add, rename, or remove one here and it
          updates across all account rate sheets and dropdowns.
        </p>
      </header>

      <section className="glass overflow-hidden rounded-lg">
        <table className="w-full text-sm">
          <thead className="glass-header text-xs uppercase tracking-wider text-fg-subtle">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium">Code</th>
              <th className="px-4 py-2.5 text-left font-medium">Label</th>
              <th className="px-4 py-2.5 text-right font-medium">Sort</th>
              <th className="px-4 py-2.5 text-right font-medium">In use</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {slas.map((s) => (
              <tr key={s.id} className="border-t border-border/60 transition-colors hover:bg-surface/40">
                <td className="px-4 py-2.5 font-mono text-xs font-semibold text-fg">{s.code}</td>
                <td className="px-4 py-2.5 text-fg-muted">{s.label}</td>
                <td className="px-4 py-2.5 text-right text-fg-muted tabular-nums">{s.sortOrder}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{s._count.accountRates}</td>
                <td className="px-4 py-2.5">
                  <SlaRowActions
                    id={s.id}
                    code={s.code}
                    label={s.label}
                    sortOrder={s.sortOrder}
                  />
                </td>
              </tr>
            ))}
            {slas.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-4 text-sm text-fg-subtle">
                  No SLAs yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

    </div>
  );
}
