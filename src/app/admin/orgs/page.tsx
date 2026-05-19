import Link from "next/link";
import { prisma } from "@/lib/db";
import { OrgCreateForm } from "./create-form";

export default async function OrgsPage() {
  const orgs = await prisma.org.findMany({
    include: { _count: { select: { clientAccounts: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Orgs</h1>
        <span className="text-sm text-neutral-500">{orgs.length} total</span>
      </div>

      <section className="rounded border border-neutral-200 dark:border-neutral-800">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 dark:bg-neutral-900">
            <tr>
              <th className="px-3 py-2 text-left">Name</th>
              <th className="px-3 py-2 text-left">Output template</th>
              <th className="px-3 py-2 text-left">Default currency</th>
              <th className="px-3 py-2 text-right">Accounts</th>
            </tr>
          </thead>
          <tbody>
            {orgs.map((o) => (
              <tr key={o.id} className="border-t border-neutral-200 dark:border-neutral-800">
                <td className="px-3 py-2">
                  <Link className="underline" href={`/admin/orgs/${o.id}` as never}>
                    {o.name}
                  </Link>
                </td>
                <td className="px-3 py-2">{o.outputTemplate}</td>
                <td className="px-3 py-2">{o.defaultCurrency}</td>
                <td className="px-3 py-2 text-right">{o._count.clientAccounts}</td>
              </tr>
            ))}
            {orgs.length === 0 && (
              <tr>
                <td className="px-3 py-4 text-neutral-500" colSpan={4}>
                  No orgs yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="flex flex-col gap-3 rounded border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="text-lg font-semibold">Create org</h2>
        <OrgCreateForm />
      </section>
    </div>
  );
}
