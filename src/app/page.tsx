import { env } from "@/lib/env";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 px-6">
      <h1 className="text-3xl font-semibold tracking-tight">
        {env.NEXT_PUBLIC_APP_NAME}
      </h1>
      <p className="text-neutral-600 dark:text-neutral-400">
        Scaffold phase. Auth, admin UI, timesheet capture, and invoice
        generation land in subsequent phases.
      </p>
    </main>
  );
}
