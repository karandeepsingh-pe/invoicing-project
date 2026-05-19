import Link from "next/link";

const sections: { href: string; label: string }[] = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/orgs", label: "Orgs" },
  { href: "/admin/technicians", label: "Technicians" },
];

export function AdminSidebar({ adminEmail }: { adminEmail: string }) {
  return (
    <aside className="flex w-56 flex-col gap-2 border-r border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="mb-4">
        <div className="text-xs uppercase tracking-wider text-neutral-500">Signed in</div>
        <div className="text-sm font-medium">{adminEmail}</div>
      </div>
      <nav className="flex flex-col gap-1">
        {sections.map((s) => (
          <Link
            key={s.href}
            href={s.href as never}
            className="rounded px-2 py-1.5 text-sm hover:bg-neutral-200 dark:hover:bg-neutral-800"
          >
            {s.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
