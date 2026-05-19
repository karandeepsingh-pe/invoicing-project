import Link from "next/link";
import { prisma } from "@/lib/db";

export default async function CommercialsPage() {
  const orgs = await prisma.org.findMany({
    orderBy: { name: "asc" },
    include: {
      clientAccounts: {
        orderBy: { name: "asc" },
        include: {
          _count: {
            select: { accountRates: true, miscFees: true, assignments: true },
          },
        },
      },
    },
  });

  const totals = orgs.reduce(
    (acc, o) => {
      acc.accounts += o.clientAccounts.length;
      for (const a of o.clientAccounts) {
        acc.rates += a._count.accountRates;
        acc.misc += a._count.miscFees;
      }
      return acc;
    },
    { accounts: 0, rates: 0, misc: 0 },
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Commercials</h1>
          <p className="text-sm text-neutral-500">
            Set rates and miscellaneous fees per client account. Pick an account to
            open its rate sheet.
          </p>
        </div>
        <span className="text-sm text-neutral-500">
          {totals.accounts} account(s) · {totals.rates} rate row(s) · {totals.misc} misc fee(s)
        </span>
      </div>

      {orgs.map((o) => (
        <section
          key={o.id}
          className="rounded border border-neutral-200 dark:border-neutral-800"
        >
          <div className="flex items-baseline justify-between border-b border-neutral-200 bg-neutral-50 px-3 py-2 text-sm font-medium dark:border-neutral-800 dark:bg-neutral-900">
            <span>
              {o.name}
              <span className="ml-2 text-xs text-neutral-500">
                {o.outputTemplate} · {o.defaultCurrency}
              </span>
            </span>
            <span className="text-xs text-neutral-500">
              {o.clientAccounts.length} account(s)
            </span>
          </div>
          <table className="w-full text-sm">
            <thead className="text-neutral-500">
              <tr>
                <th className="px-3 py-2 text-left">Account</th>
                <th className="px-3 py-2 text-left">Currency</th>
                <th className="px-3 py-2 text-right">Rate rows</th>
                <th className="px-3 py-2 text-right">Misc fees</th>
                <th className="px-3 py-2 text-right">Active assignments</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {o.clientAccounts.map((a) => (
                <tr key={a.id} className="border-t border-neutral-200 dark:border-neutral-800">
                  <td className="px-3 py-2">
                    <Link className="underline" href={`/admin/accounts/${a.id}` as never}>
                      {a.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{a.currency ?? o.defaultCurrency}</td>
                  <td className="px-3 py-2 text-right">{a._count.accountRates}</td>
                  <td className="px-3 py-2 text-right">{a._count.miscFees}</td>
                  <td className="px-3 py-2 text-right">{a._count.assignments}</td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      className="text-xs underline"
                      href={`/admin/accounts/${a.id}` as never}
                    >
                      Manage rates →
                    </Link>
                  </td>
                </tr>
              ))}
              {o.clientAccounts.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-3 text-neutral-500">
                    No accounts under this org yet.{" "}
                    <Link
                      className="underline"
                      href={`/admin/orgs/${o.id}` as never}
                    >
                      Add one
                    </Link>
                    .
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      ))}

      {orgs.length === 0 && (
        <div className="rounded border border-neutral-200 p-4 text-sm text-neutral-500 dark:border-neutral-800">
          No orgs yet. Create one under <Link className="underline" href={"/admin/orgs" as never}>Orgs</Link>.
        </div>
      )}
    </div>
  );
}
