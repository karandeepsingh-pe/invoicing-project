import Link from "next/link";
import { notFound } from "next/navigation";
import { TechType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isActive } from "@/lib/domain/rate-card-resolver";
import { RateCardCreateForm } from "./create-rate-card-form";
import { RateCardDeleteButton } from "./rate-card-row-actions";

const techTypeOrder: TechType[] = [
  TechType.FTE,
  TechType.PROJECT,
  TechType.DISPATCH,
  TechType.SCHEDULED_VISIT,
];

function fmtDate(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "—";
}

function fmtMoney(v: { toString(): string }, currency: string) {
  return `${currency} ${Number(v.toString()).toFixed(2)}`;
}

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  const { accountId } = await params;
  const account = await prisma.clientAccount.findUnique({
    where: { id: accountId },
    include: {
      org: true,
      rateCards: { orderBy: [{ techType: "asc" }, { rateUnit: "asc" }, { effectiveFrom: "desc" }] },
      assignments: {
        include: { technician: true },
        orderBy: { startDate: "desc" },
      },
    },
  });
  if (!account) notFound();

  const currency = account.currency ?? account.org.defaultCurrency;
  const today = new Date();
  const grouped = new Map<TechType, typeof account.rateCards>();
  for (const t of techTypeOrder) grouped.set(t, []);
  for (const c of account.rateCards) grouped.get(c.techType)!.push(c);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/admin/orgs/${account.org.id}` as never} className="text-sm text-neutral-500 underline">
          ← {account.org.name}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{account.name}</h1>
        <p className="text-sm text-neutral-500">
          {account.org.outputTemplate} · billing currency {currency}
        </p>
      </div>

      <section className="flex flex-col gap-3 rounded border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="text-lg font-semibold">Rate cards</h2>
        {techTypeOrder.map((t) => {
          const rows = grouped.get(t)!;
          return (
            <div key={t} className="rounded border border-neutral-200 dark:border-neutral-800">
              <div className="flex items-baseline justify-between border-b border-neutral-200 bg-neutral-50 px-3 py-2 text-sm font-medium dark:border-neutral-800 dark:bg-neutral-900">
                <span>{t}</span>
                <span className="text-xs text-neutral-500">{rows.length} row(s)</span>
              </div>
              <table className="w-full text-sm">
                <thead className="text-neutral-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Unit</th>
                    <th className="px-3 py-2 text-right">Rate</th>
                    <th className="px-3 py-2 text-right">OT rate</th>
                    <th className="px-3 py-2 text-left">Effective from</th>
                    <th className="px-3 py-2 text-left">Effective to</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => {
                    const active = isActive(c, today);
                    return (
                      <tr key={c.id} className="border-t border-neutral-200 dark:border-neutral-800">
                        <td className="px-3 py-2">{c.rateUnit}</td>
                        <td className="px-3 py-2 text-right">{fmtMoney(c.rateAmount, currency)}</td>
                        <td className="px-3 py-2 text-right">
                          {c.otRate ? fmtMoney(c.otRate, currency) : "—"}
                        </td>
                        <td className="px-3 py-2">{fmtDate(c.effectiveFrom)}</td>
                        <td className="px-3 py-2">{fmtDate(c.effectiveTo)}</td>
                        <td className="px-3 py-2">
                          <span
                            className={
                              active
                                ? "rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-800 dark:bg-green-950 dark:text-green-300"
                                : "rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
                            }
                          >
                            {active ? "active" : "inactive"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <RateCardDeleteButton id={c.id} />
                        </td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-3 py-3 text-neutral-500">
                        No rate cards for {t} yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          );
        })}

        <div className="mt-2 rounded border border-neutral-200 p-3 dark:border-neutral-800">
          <h3 className="mb-2 text-sm font-semibold">Add rate card</h3>
          <RateCardCreateForm clientAccountId={account.id} />
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="text-lg font-semibold">Assignments</h2>
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-500 dark:bg-neutral-900">
            <tr>
              <th className="px-3 py-2 text-left">Technician</th>
              <th className="px-3 py-2 text-left">Tech type</th>
              <th className="px-3 py-2 text-left">Start</th>
              <th className="px-3 py-2 text-left">End</th>
            </tr>
          </thead>
          <tbody>
            {account.assignments.map((a) => (
              <tr key={a.id} className="border-t border-neutral-200 dark:border-neutral-800">
                <td className="px-3 py-2">
                  <Link className="underline" href={`/admin/technicians/${a.technician.id}` as never}>
                    {a.technician.name}
                  </Link>
                </td>
                <td className="px-3 py-2">{a.techType}</td>
                <td className="px-3 py-2">{fmtDate(a.startDate)}</td>
                <td className="px-3 py-2">{fmtDate(a.endDate)}</td>
              </tr>
            ))}
            {account.assignments.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-neutral-500">
                  No assignments to this account yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
