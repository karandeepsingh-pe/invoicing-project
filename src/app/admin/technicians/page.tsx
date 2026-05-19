import Link from "next/link";
import { RateCategory } from "@prisma/client";
import { prisma } from "@/lib/db";
import { TechnicianCreateForm } from "./create-form";

const categoryLabel: Record<RateCategory, string> = {
  DEDICATED: "Dedicated",
  PROJECT_TM: "Project / T&M",
  DISPATCH_SCHED: "Dispatch + Scheduled Visit",
};

export default async function TechniciansPage() {
  const [techs, orgs] = await Promise.all([
    prisma.technician.findMany({
      include: {
        employerOrg: true,
        _count: { select: { assignments: true } },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.org.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Technicians</h1>
        <span className="text-sm text-neutral-500">{techs.length} total</span>
      </div>

      <section className="rounded border border-neutral-200 dark:border-neutral-800">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 dark:bg-neutral-900">
            <tr>
              <th className="px-3 py-2 text-left">Name</th>
              <th className="px-3 py-2 text-left">Primary category</th>
              <th className="px-3 py-2 text-left">Band</th>
              <th className="px-3 py-2 text-left">Employer</th>
              <th className="px-3 py-2 text-right">Assignments</th>
            </tr>
          </thead>
          <tbody>
            {techs.map((t) => (
              <tr key={t.id} className="border-t border-neutral-200 dark:border-neutral-800">
                <td className="px-3 py-2">
                  <Link className="underline" href={`/admin/technicians/${t.id}` as never}>
                    {t.firstName} {t.lastName}
                  </Link>
                </td>
                <td className="px-3 py-2">{categoryLabel[t.primaryCategory]}</td>
                <td className="px-3 py-2">Band {t.band}</td>
                <td className="px-3 py-2">{t.employerOrg.name}</td>
                <td className="px-3 py-2 text-right">{t._count.assignments}</td>
              </tr>
            ))}
            {techs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-neutral-500">
                  No technicians yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="flex flex-col gap-3 rounded border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="text-lg font-semibold">Add technician</h2>
        {orgs.length === 0 ? (
          <p className="text-sm text-neutral-500">
            Create an org first so the technician has an employer.
          </p>
        ) : (
          <TechnicianCreateForm orgs={orgs} />
        )}
      </section>
    </div>
  );
}
