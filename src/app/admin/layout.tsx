import { requireSession } from "@/lib/auth/session";
import { AUTH_ENABLED } from "@/auth.config";
import { AdminSidebar } from "@/components/admin/sidebar";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Any signed-in Ovation user (admin or SDM) may enter the workspace; admin-only
  // pages gate themselves with requireAdmin(). The sidebar hides admin links for SDMs.
  const session = await requireSession();
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <AdminSidebar
        userEmail={session.email}
        isAdmin={session.role === "ADMIN"}
        showSignOut={AUTH_ENABLED}
      />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
