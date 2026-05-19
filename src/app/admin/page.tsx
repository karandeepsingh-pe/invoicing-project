import Link from "next/link";
import { prisma } from "@/lib/db";

export default async function AdminDashboard() {
  const [orgCount, accountCount, techCount, assignmentCount, activeFteCount] = await Promise.all([
    prisma.org.count(),
    prisma.clientAccount.count(),
    prisma.technician.count(),
    prisma.assignment.count(),
    prisma.assignment.count({ where: { techType: "FTE", endDate: null } }),
  ]);

  const cards = [
    { label: "Orgs", value: orgCount, href: "/admin/orgs" },
    { label: "Client accounts", value: accountCount, href: "/admin/orgs" },
    { label: "Technicians", value: techCount, href: "/admin/technicians" },
    { label: "Assignments", value: assignmentCount, href: "/admin/technicians" },
    { label: "Active FTE", value: activeFteCount, href: "/admin/technicians" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Admin</h1>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        onboarding-v1 — configure orgs, accounts, rate cards, technicians, and assignments.
      </p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href as never}
            className="rounded border border-neutral-200 p-4 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900"
          >
            <div className="text-xs uppercase tracking-wide text-neutral-500">{c.label}</div>
            <div className="text-2xl font-semibold">{c.value}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
