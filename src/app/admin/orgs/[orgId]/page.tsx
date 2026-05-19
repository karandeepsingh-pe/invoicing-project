import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { ClientAccountCreateForm } from "./create-account-form";

export default async function OrgDetailPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const org = await prisma.org.findUnique({
    where: { id: orgId },
    include: {
      clientAccounts: {
        include: { _count: { select: { rateCards: true, assignments: true } } },
        orderBy: { name: "asc" },
      },
    },
  });
  if (!org) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin/orgs" className="text-sm text-neutral-500 underline">
          ← Orgs
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{org.name}</h1>
        <p className="text-sm text-neutral-500">
          {org.outputTemplate} · default {org.defaultCurrency}
        </p>
      </div>

      <section className="rounded border border-neutral-200 dark:border-neutral-800">
        <div className="border-b border-neutral-200 px-3 py-2 text-sm font-medium dark:border-neutral-800">
          Client accounts
        </div>
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 dark:bg-neutral-900">
            <tr>
              <th className="px-3 py-2 text-left">Name</th>
              <th className="px-3 py-2 text-left">Currency</th>
              <th className="px-3 py-2 text-right">Rate cards</th>
              <th className="px-3 py-2 text-right">Assignments</th>
            </tr>
          </thead>
          <tbody>
            {org.clientAccounts.map((a) => (
              <tr key={a.id} className="border-t border-neutral-200 dark:border-neutral-800">
                <td className="px-3 py-2">
                  <Link className="underline" href={`/admin/accounts/${a.id}` as never}>
                    {a.name}
                  </Link>
                </td>
                <td className="px-3 py-2">{a.currency ?? org.defaultCurrency}</td>
                <td className="px-3 py-2 text-right">{a._count.rateCards}</td>
                <td className="px-3 py-2 text-right">{a._count.assignments}</td>
              </tr>
            ))}
            {org.clientAccounts.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-neutral-500">
                  No accounts yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="flex flex-col gap-3 rounded border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="text-lg font-semibold">Create account</h2>
        <ClientAccountCreateForm orgId={org.id} defaultCurrency={org.defaultCurrency} />
      </section>
    </div>
  );
}
