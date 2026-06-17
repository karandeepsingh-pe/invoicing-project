import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { PostalCodeRowActions } from "./postal-code-row";
import { PostalCodeCreateDialog } from "./create-dialog";

export default async function PostalCodesMastersPage() {
  await requireAdmin();
  const rows = await prisma.postalCode.findMany({
    orderBy: [{ sortOrder: "asc" }, { zipcode: "asc" }],
    include: { _count: { select: { technicians: true } } },
  });

  return (
    <div className="flex flex-col gap-8 animate-fade-in">
      <header className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.25em] text-accent">Masters</span>
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-3xl font-semibold tracking-tighter2 sm:text-4xl">Postal codes</h1>
          <div className="flex items-center gap-3">
            <span className="text-sm text-fg-subtle">{rows.length} total</span>
            <PostalCodeCreateDialog />
          </div>
        </div>
        <p className="max-w-2xl text-sm text-fg-muted">
          Maps each zipcode to a city, state, and country. Enter a zipcode on a technician form and
          the rest fills in from here. New zipcodes you add on the technician form show up in this
          list too.
        </p>
      </header>

      <section className="glass overflow-hidden rounded-lg">
        <table className="w-full text-sm">
          <thead className="glass-header text-xs uppercase tracking-wider text-fg-subtle">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium">Zipcode</th>
              <th className="px-4 py-2.5 text-left font-medium">City</th>
              <th className="px-4 py-2.5 text-left font-medium">State</th>
              <th className="px-4 py-2.5 text-left font-medium">Country</th>
              <th className="px-4 py-2.5 text-right font-medium">Sort</th>
              <th className="px-4 py-2.5 text-right font-medium">In use</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border/60 transition-colors hover:bg-surface/40">
                <td className="px-4 py-2.5 font-mono text-xs font-semibold text-fg">{r.zipcode}</td>
                <td className="px-4 py-2.5 text-fg-muted">{r.city}</td>
                <td className="px-4 py-2.5 text-fg-muted">{r.state}</td>
                <td className="px-4 py-2.5 text-fg-muted">{r.country}</td>
                <td className="px-4 py-2.5 text-right text-fg-muted tabular-nums">{r.sortOrder}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{r._count.technicians}</td>
                <td className="px-4 py-2.5">
                  <PostalCodeRowActions
                    id={r.id}
                    zipcode={r.zipcode}
                    city={r.city}
                    state={r.state}
                    country={r.country}
                    sortOrder={r.sortOrder}
                  />
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-4 text-sm text-fg-subtle">
                  No postal codes yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
