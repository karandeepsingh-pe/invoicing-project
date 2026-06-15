import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CreateAccountUnderOrgDialog } from "./create-account-dialog";
import { OrgEditForm } from "./org-edit-form";

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
        include: { _count: { select: { accountRates: true, assignments: true } } },
        orderBy: { name: "asc" },
      },
    },
  });
  if (!org) notFound();

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <Link href="/admin/management" className="text-xs font-medium text-fg-subtle hover:text-fg">
          ← Client Management
        </Link>
        <div className="mt-1 flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="break-words text-2xl font-semibold tracking-tight sm:text-3xl">{org.name}</h1>
            <p className="text-sm text-fg-muted">
              {org.outputTemplate} · default currency {org.defaultCurrency}
            </p>
          </div>
          <OrgEditForm
            id={org.id}
            name={org.name}
            outputTemplate={org.outputTemplate}
            defaultCurrency={org.defaultCurrency}
            remitClientCode={org.remitClientCode}
            remitClientName={org.remitClientName}
            remitClientAddress={org.remitClientAddress}
          />
        </div>
      </header>

      <section className="glass overflow-hidden">
        <div className="flex items-center justify-between border-b border-border bg-surface-2 px-4 py-2.5">
          <span className="text-sm font-semibold tracking-tight">Client accounts</span>
          <CreateAccountUnderOrgDialog
            orgId={org.id}
            defaultCurrency={org.defaultCurrency}
          />
        </div>
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wider text-fg-subtle">
            <tr className="border-b border-border">
              <th className="px-4 py-2 text-left font-medium">Name</th>
              <th className="px-4 py-2 text-left font-medium">Currency</th>
              <th className="px-4 py-2 text-right font-medium">Rate rows</th>
              <th className="px-4 py-2 text-right font-medium">Assignments</th>
            </tr>
          </thead>
          <tbody>
            {org.clientAccounts.map((a) => (
              <tr
                key={a.id}
                className="border-b border-border last:border-b-0 transition-colors hover:bg-surface-2"
              >
                <td className="px-4 py-2.5">
                  <Link className="font-medium text-fg hover:text-accent" href={`/admin/accounts/${a.id}` as never}>
                    {a.name}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-fg-muted">{a.currency ?? org.defaultCurrency}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{a._count.accountRates}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{a._count.assignments}</td>
              </tr>
            ))}
            {org.clientAccounts.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-4 text-sm text-fg-subtle">
                  No accounts yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

    </div>
  );
}
