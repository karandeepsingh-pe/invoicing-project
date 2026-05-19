import Link from "next/link";
import { notFound } from "next/navigation";
import { RateCategory } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ratesForTechnician } from "@/lib/domain/account-rate-resolver";
import { AssignmentCreateForm, type AccountOption } from "./create-assignment-form";
import { EndAssignmentButton } from "./end-assignment-button";

const categoryLabel: Record<RateCategory, string> = {
  DEDICATED: "Dedicated",
  PROJECT_TM: "Project / T&M",
  DISPATCH_SCHED: "Dispatch + Scheduled Visit",
};

function fmtDate(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "—";
}

export default async function TechnicianDetailPage({
  params,
}: {
  params: Promise<{ techId: string }>;
}) {
  const { techId } = await params;
  const tech = await prisma.technician.findUnique({
    where: { id: techId },
    include: {
      employerOrg: true,
      assignments: {
        include: { clientAccount: { include: { org: true } } },
        orderBy: [{ endDate: "asc" }, { startDate: "desc" }],
      },
    },
  });
  if (!tech) notFound();

  const accounts = await prisma.clientAccount.findMany({
    include: {
      org: { select: { name: true, defaultCurrency: true } },
      accountRates: {
        include: { rateSubCategory: true, sla: true },
      },
    },
    orderBy: [{ org: { name: "asc" } }, { name: "asc" }],
  });

  const today = new Date();
  const accountOptions: AccountOption[] = accounts.map((a) => {
    const previewByCategory = Object.fromEntries(
      Object.values(RateCategory).map((cat) => [
        cat,
        ratesForTechnician(a.accountRates, cat, tech.band, today).map((r) => ({
          subCategoryLabel: r.rateSubCategory.label,
          sla: r.sla.code,
          rateAmount: r.rateAmount ? r.rateAmount.toString() : null,
        })),
      ]),
    ) as AccountOption["previewByCategory"];
    return {
      id: a.id,
      label: `${a.org.name} / ${a.name}`,
      currency: a.currency ?? a.org.defaultCurrency,
      previewByCategory,
    };
  });

  const activeDedicated = tech.assignments.find(
    (a) => a.rateCategory === RateCategory.DEDICATED && a.endDate === null,
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin/technicians" className="text-sm text-neutral-500 underline">
          ← Technicians
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">
          {tech.firstName} {tech.lastName}
        </h1>
        <p className="text-sm text-neutral-500">
          {categoryLabel[tech.primaryCategory]} · Band {tech.band} · employed by {tech.employerOrg.name}
        </p>
        {activeDedicated && (
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
            Active DEDICATED assignment at {activeDedicated.clientAccount.org.name} /{" "}
            {activeDedicated.clientAccount.name}. End it before starting a new DEDICATED engagement.
          </p>
        )}
      </div>

      <section className="rounded border border-neutral-200 dark:border-neutral-800">
        <div className="border-b border-neutral-200 px-3 py-2 text-sm font-medium dark:border-neutral-800">
          Assignments
        </div>
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-500 dark:bg-neutral-900">
            <tr>
              <th className="px-3 py-2 text-left">Account</th>
              <th className="px-3 py-2 text-left">Category</th>
              <th className="px-3 py-2 text-left">Start</th>
              <th className="px-3 py-2 text-left">End</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {tech.assignments.map((a) => (
              <tr key={a.id} className="border-t border-neutral-200 dark:border-neutral-800">
                <td className="px-3 py-2">
                  <Link className="underline" href={`/admin/accounts/${a.clientAccount.id}` as never}>
                    {a.clientAccount.org.name} / {a.clientAccount.name}
                  </Link>
                </td>
                <td className="px-3 py-2">{categoryLabel[a.rateCategory]}</td>
                <td className="px-3 py-2">{fmtDate(a.startDate)}</td>
                <td className="px-3 py-2">{fmtDate(a.endDate)}</td>
                <td className="px-3 py-2 text-right">
                  {a.endDate === null && <EndAssignmentButton id={a.id} />}
                </td>
              </tr>
            ))}
            {tech.assignments.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-neutral-500">
                  No assignments yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="flex flex-col gap-3 rounded border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="text-lg font-semibold">New assignment</h2>
        {accountOptions.length === 0 ? (
          <p className="text-sm text-neutral-500">
            Create at least one client account with rate rows first.
          </p>
        ) : (
          <AssignmentCreateForm
            technicianId={tech.id}
            technicianBand={tech.band}
            primaryCategory={tech.primaryCategory}
            accounts={accountOptions}
          />
        )}
      </section>
    </div>
  );
}
