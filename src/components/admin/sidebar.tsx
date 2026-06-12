"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { OvationLogo } from "@/components/brand/ovation-logo";

type FlatLink = { kind: "link"; href: string; label: string };
type Group = { kind: "group"; id: string; label: string; children: FlatLink[] };
type Section = FlatLink | Group;

const sections: Section[] = [
  { kind: "link", href: "/admin", label: "Dashboard" },
  { kind: "link", href: "/admin/management", label: "Client Management" },
  { kind: "link", href: "/admin/timesheets", label: "Timesheets" },
  { kind: "link", href: "/admin/invoices", label: "Invoices" },
  {
    kind: "group",
    id: "masters",
    label: "Masters",
    children: [
      { kind: "link", href: "/admin/masters/slas", label: "SLAs" },
      { kind: "link", href: "/admin/masters/sub-categories", label: "Sub-categories" },
      { kind: "link", href: "/admin/masters/visit-types", label: "Visit types" },
      { kind: "link", href: "/admin/masters/holidays", label: "Holidays" },
      { kind: "link", href: "/admin/masters/bands", label: "Bands" },
      { kind: "link", href: "/admin/masters/postal-codes", label: "Postal codes" },
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function groupContainsActive(pathname: string, group: Group): boolean {
  return group.children.some((c) => isActive(pathname, c.href));
}

export function AdminSidebar({ adminEmail }: { adminEmail: string }) {
  const pathname = usePathname() ?? "/admin";
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set());
  const [mobileOpen, setMobileOpen] = useState(false);

  // Auto-open the group whose child is active (on first mount + when path changes).
  useEffect(() => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      for (const s of sections) {
        if (s.kind === "group" && groupContainsActive(pathname, s)) {
          next.add(s.id);
        }
      }
      return next;
    });
  }, [pathname]);

  // Drawer follows navigation closed; Escape + scroll lock mirror dialog.tsx.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileOpen(false);
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  function toggleGroup(id: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const logo = (
    <Link href="/admin" className="flex items-center px-1">
      <OvationLogo />
    </Link>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="glass-strong sticky top-0 hidden h-screen w-64 flex-col justify-between rounded-none border-b-0 border-l-0 border-t-0 px-4 py-5 md:flex">
        {renderContent()}
      </aside>

      {/* Mobile app bar */}
      <header className="glass-strong sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between rounded-none border-x-0 border-t-0 px-4 md:hidden">
        {logo}
        <button
          type="button"
          aria-label="Open navigation"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen(true)}
          className="rounded-md p-2 text-fg-muted transition-colors hover:bg-surface/40 hover:text-fg"
        >
          <MenuIcon className="h-5 w-5" />
        </button>
      </header>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-fg/40 animate-fade-in" onClick={() => setMobileOpen(false)} />
          <div className="glass-strong absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col justify-between overflow-y-auto rounded-none border-y-0 border-l-0 px-4 py-5 animate-slide-in motion-reduce:animate-none">
            {renderContent()}
          </div>
        </div>
      )}
    </>
  );

  function renderContent() {
    return (
      <>
      <div className="flex flex-col gap-7">
        {logo}

        <nav className="flex flex-col gap-0.5">
          <span className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-fg-subtle">
            Workspace
          </span>
          {sections.map((s) => {
            if (s.kind === "link") {
              const active = isActive(pathname, s.href);
              return (
                <Link
                  key={s.href}
                  href={s.href as never}
                  aria-current={active ? "page" : undefined}
                  className={
                    "group relative flex items-center rounded-md px-3 py-2 text-sm font-medium transition-all " +
                    (active
                      ? "text-fg"
                      : "text-fg-muted transition-colors duration-300 hover:text-fg")
                  }
                >
                  {active && (
                    <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-accent" aria-hidden="true" />
                  )}
                  <span>{s.label}</span>
                </Link>
              );
            }
            // Group
            const open = openGroups.has(s.id);
            const containsActive = groupContainsActive(pathname, s);
            return (
              <div key={s.id} className="flex flex-col">
                <button
                  type="button"
                  onClick={() => toggleGroup(s.id)}
                  aria-expanded={open}
                  className={
                    "group flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-all " +
                    (containsActive
                      ? "text-fg"
                      : "text-fg-muted transition-colors duration-300 hover:text-fg")
                  }
                >
                  <span>{s.label}</span>
                  <ChevronIcon
                    className={`h-3.5 w-3.5 text-fg-subtle transition-transform duration-200 ${open ? "rotate-90" : "rotate-0"}`}
                  />
                </button>
                {open && (
                  <div className="ml-2 mt-0.5 flex flex-col gap-0.5 border-l border-border/60 pl-2">
                    {s.children.map((c) => {
                      const active = isActive(pathname, c.href);
                      return (
                        <Link
                          key={c.href}
                          href={c.href as never}
                          aria-current={active ? "page" : undefined}
                          className={
                            "relative flex items-center rounded-md px-3 py-1.5 text-xs font-medium transition-all " +
                            (active
                              ? "text-fg"
                              : "text-fg-muted transition-colors duration-300 hover:text-fg")
                          }
                        >
                          {active && (
                            <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-accent" aria-hidden="true" />
                          )}
                          <span>{c.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </div>

      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <div className="px-1">
          <div className="text-[10px] uppercase tracking-wider text-fg-subtle">Signed in</div>
          <div className="truncate text-xs font-medium text-fg">{adminEmail}</div>
        </div>
        <ThemeToggle />
      </div>
      </>
    );
  }
}

function MenuIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zM2 10a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 10zm0 5.25a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
      <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
    </svg>
  );
}
