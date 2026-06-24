import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { AUTH_ENABLED } from "@/auth.config";
import { OvationLogo } from "@/components/brand/ovation-logo";

export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  // Dev (no Entra): there's no gate, so skip straight into the app.
  if (!AUTH_ENABLED) redirect("/admin");

  const session = await auth();
  if (session?.user) redirect("/admin");

  const { error, callbackUrl } = await searchParams;
  const accessDenied = error === "AccessDenied";

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="glass-strong flex w-full max-w-sm flex-col items-center gap-6 rounded-xl px-8 py-10">
        <OvationLogo />
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-lg font-semibold tracking-tight">Sign in</h1>
          <p className="text-sm text-fg-muted">
            Use your Ovation Microsoft account to continue.
          </p>
        </div>

        {accessDenied && (
          <div className="w-full rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-center text-xs text-danger">
            That account isn&rsquo;t allowed. Sign in with an @ovationwps.com account.
          </div>
        )}

        <form
          className="w-full"
          action={async () => {
            "use server";
            await signIn("microsoft-entra-id", {
              redirectTo: callbackUrl && callbackUrl.startsWith("/") ? callbackUrl : "/admin",
            });
          }}
        >
          <button
            type="submit"
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-hover"
          >
            Continue with Microsoft
          </button>
        </form>

        <p className="text-center text-[11px] text-fg-subtle">
          Access is restricted to Ovation staff.
        </p>
      </div>
    </main>
  );
}
