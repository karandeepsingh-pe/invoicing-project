import Link from "next/link";
import { env } from "@/lib/env";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 px-6">
      <h1 className="text-3xl font-semibold tracking-tight">
        {env.NEXT_PUBLIC_APP_NAME}
      </h1>
      <p className="text-neutral-600 dark:text-neutral-400">
        Onboarding-v1 — admins configure orgs, accounts, rate cards, technicians,
        and assignments. Timesheet capture and invoice generation land in later phases.
      </p>
      <Link
        href="/admin"
        className="self-start rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
      >
        Open admin
      </Link>
    </main>
  );
}
