import "server-only";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { UserRole } from "@prisma/client";

export type AdminSession = {
  userId: string;
  email: string;
  name: string | null;
};

// onboarding-v1 dev gate.
// Phase 3 swaps this implementation for a real NextAuth session lookup;
// callers (pages, server actions) keep the same `requireAdmin()` shape.
export async function requireAdmin(): Promise<AdminSession> {
  const email = env.DEV_ADMIN_EMAIL;
  if (!email) {
    throw new Error(
      "Admin UI is gated by DEV_ADMIN_EMAIL during onboarding-v1. Set it in .env.",
    );
  }

  const user = await prisma.user.upsert({
    where: { email },
    update: { role: UserRole.ADMIN },
    create: { email, name: "Dev Admin", role: UserRole.ADMIN },
    select: { id: true, email: true, name: true, role: true },
  });

  if (user.role !== UserRole.ADMIN) {
    throw new Error(`User ${email} is not an admin`);
  }

  return { userId: user.id, email: user.email, name: user.name };
}
