import { prisma } from "@/lib/db";
import { VisitTypeRowActions } from "./visit-type-row";
import { VisitTypeCreateDialog } from "./create-dialog";

export default async function VisitTypesMastersPage() {
  const types = await prisma.dispatchVisitType.findMany({
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    include: { _count: { select: { visits: true } } },
  });

  return (
    <div className="flex flex-col gap-8 animate-fade-in">
      <header className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-accent">Masters</span>
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-4xl font-semibold tracking-tighter2">Dispatch visit types</h1>
          <div className="flex items-center gap-3">
            <span className="text-sm text-fg-subtle">{types.length} total</span>
            <VisitTypeCreateDialog />
          </div>
        </div>
        <p className="max-w-2xl text-sm text-fg-muted">
          Install / Repair / Audit / … picked per dispatch visit. Descriptive metadata for
          now; the dispatch picker only offers active types.
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
            {types.map((t) => (
              <tr key={t.id} className="border-t border-border/60 transition-colors hover:bg-surface/40">
                <td className="px-4 py-2.5 font-mono text-xs font-semibold text-fg">{t.code}</td>
                <td className="px-4 py-2.5 text-fg-muted">{t.label}</td>
                <td className="px-4 py-2.5 text-right text-fg-muted tabular-nums">{t.sortOrder}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{t._count.visits}</td>
                <td className="px-4 py-2.5">
                  <VisitTypeRowActions id={t.id} code={t.code} label={t.label} sortOrder={t.sortOrder} />
                </td>
              </tr>
            ))}
            {types.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-4 text-sm text-fg-subtle">
                  No visit types yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
