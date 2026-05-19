import { requireAdmin } from "@/lib/auth/dev-session";
import { AdminSidebar } from "@/components/admin/sidebar";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  return (
    <div className="flex min-h-screen">
      <AdminSidebar adminEmail={admin.email} />
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
