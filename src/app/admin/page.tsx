import Link from "next/link";
import { prisma } from "@/lib/db";

export default async function AdminDashboard() {
  const [orgCount, accountCount, techCount, assignmentCount, activeDedicatedCount] = await Promise.all([
    prisma.org.count(),
    prisma.clientAccount.count(),
    prisma.technician.count(),
    prisma.assignment.count(),
    prisma.assignment.count({ where: { rateCategory: "DEDICATED", endDate: null } }),
  ]);

  const cards = [
    { label: "Orgs", value: orgCount, href: "/admin/orgs", hint: "Vendor partners" },
    { label: "Client accounts", value: accountCount, href: "/admin/commercials", hint: "Billing units" },
    { label: "Technicians", value: techCount, href: "/admin/technicians", hint: "Workforce" },
    { label: "Assignments", value: assignmentCount, href: "/admin/technicians", hint: "Total ever created" },
    { label: "Active dedicated", value: activeDedicatedCount, href: "/admin/technicians", hint: "FTE engagements" },
  ];

  return (
    <div className="flex flex-col gap-10 animate-fade-in">
      <header className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-accent">Dashboard</span>
        <h1 className="text-4xl font-semibold tracking-tighter2">Welcome back</h1>
        <p className="max-w-2xl text-sm text-fg-muted">
          Configure orgs, accounts, rate cards, technicians, and assignments. Generate invoice
          runs from the Commercials tab once rate sheets are filled in.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href as never}
            className="group flex flex-col gap-3 rounded-xl glass p-5 transition-all hover:-translate-y-0.5"
          >
            <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
              {c.label}
            </div>
            <div className="text-4xl font-semibold tracking-tighter2 text-fg tabular-nums">
              {c.value}
            </div>
            <div className="text-[11px] text-fg-subtle">{c.hint}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
