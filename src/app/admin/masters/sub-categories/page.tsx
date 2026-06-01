import { RateCategory } from "@prisma/client";
import { prisma } from "@/lib/db";
import { SubCategoryRowActions } from "./sub-cat-row";
import { SubCategoryCreateDialog } from "./create-dialog";

const categoryLabel: Record<RateCategory, string> = {
  DEDICATED: "Dedicated",
  PROJECT_TM: "Project / T&M",
  DISPATCH_SCHED: "Dispatch",
  SCHEDULED: "Scheduled Visit",
};

export default async function SubCategoriesMastersPage() {
  const rows = await prisma.rateSubCategory.findMany({
    orderBy: [{ rateCategory: "asc" }, { sortOrder: "asc" }, { code: "asc" }],
    include: { _count: { select: { accountRates: true } } },
  });

  const grouped = new Map<RateCategory, typeof rows>();
  for (const c of Object.values(RateCategory)) grouped.set(c, []);
  for (const r of rows) grouped.get(r.rateCategory)!.push(r);

  return (
    <div className="flex flex-col gap-8 animate-fade-in">
      <header className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-accent">Masters</span>
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-4xl font-semibold tracking-tighter2">Rate sub-categories</h1>
          <span className="text-sm text-fg-subtle">{rows.length} total</span>
        </div>
        <p className="max-w-2xl text-sm text-fg-muted">
          Rows in the rate matrix. Each (rate category, code) is unique. Adding new sub-categories
          here exposes them in every account&rsquo;s &ldquo;Add rate row&rdquo; form.
        </p>
      </header>

      <div className="flex flex-col gap-4">
        {Object.values(RateCategory).map((cat) => {
          const list = grouped.get(cat)!;
          return (
            <section key={cat} className="glass overflow-hidden rounded-lg">
              <div className="glass-header flex items-center justify-between border-b border-border/60 px-4 py-2.5 text-sm font-semibold tracking-tightish">
                <span>{categoryLabel[cat]}</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-normal text-fg-subtle">
                    {list.length} sub-categor{list.length === 1 ? "y" : "ies"}
                  </span>
                  <SubCategoryCreateDialog lockedCategory={cat} />
                </div>
              </div>
              <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-wider text-fg-subtle">
                  <tr className="border-b border-border/60">
                    <th className="px-4 py-2 text-left font-medium">Code</th>
                    <th className="px-4 py-2 text-left font-medium">Label</th>
                    <th className="px-4 py-2 text-right font-medium">Sort</th>
                    <th className="px-4 py-2 text-left font-medium">OT?</th>
                    <th className="px-4 py-2 text-right font-medium">In use</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => (
                    <tr key={r.id} className="border-b border-border/40 last:border-b-0 transition-colors hover:bg-surface/40">
                      <td className="px-4 py-2.5 font-mono text-xs font-semibold text-fg">{r.code}</td>
                      <td className="px-4 py-2.5 text-fg-muted">{r.label}</td>
                      <td className="px-4 py-2.5 text-right text-fg-muted tabular-nums">{r.sortOrder}</td>
                      <td className="px-4 py-2.5 text-fg-muted">{r.isOvertimeVariant ? "Yes" : "—"}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{r._count.accountRates}</td>
                      <td className="px-4 py-2.5">
                        <SubCategoryRowActions
                          id={r.id}
                          code={r.code}
                          label={r.label}
                          rateCategory={r.rateCategory}
                          sortOrder={r.sortOrder}
                          isOvertimeVariant={r.isOvertimeVariant}
                        />
                      </td>
                    </tr>
                  ))}
                  {list.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-3 text-sm text-fg-subtle">
                        No sub-categories under {categoryLabel[cat]}.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </section>
          );
        })}
      </div>

    </div>
  );
}
