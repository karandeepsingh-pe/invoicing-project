import Link from "next/link";
import { env } from "@/lib/env";
import { ThemeToggle } from "@/components/theme-toggle";
import { OvationLockup } from "@/components/brand/ovation-logo";

export default function HomePage() {
  return (
    <main className="relative mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-10 px-6">
      <div className="absolute right-6 top-6 w-32">
        <ThemeToggle />
      </div>
      <div className="flex items-center gap-4">
        <OvationLockup width={180} />
        <span className="sr-only">{env.NEXT_PUBLIC_APP_NAME}</span>
      </div>
      <div className="flex flex-col gap-5">
        <div className="h-px w-12 bg-accent" aria-hidden="true" />
        <h1 className="max-w-2xl text-5xl leading-[1.02] text-fg sm:text-6xl">
          Invoice automation,<br />
          <span className="italic text-fg-muted">end to end.</span>
        </h1>
        <p className="max-w-xl text-base leading-relaxed text-fg-muted">
          Admins configure orgs, accounts, rate cards, technicians, and assignments. SDMs capture
          timesheets. The engine generates FSO and Pre-Invoice sheets on demand.
        </p>
      </div>
      <div className="flex gap-3">
        <Link
          href="/admin"
          className="inline-flex items-center rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-accent-fg shadow-sm transition-colors hover:bg-accent-hover"
        >
          Open admin
          <svg className="ml-1.5 h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
          </svg>
        </Link>
      </div>
    </main>
  );
}
