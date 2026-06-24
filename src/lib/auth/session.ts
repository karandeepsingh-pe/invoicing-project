import "server-only";
import { notFound, redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { auth } from "@/auth";
import { AUTH_ENABLED } from "@/auth.config";
import { accountScopeWhere, type SessionInfo } from "./scope";

export { accountScopeWhere };
export type { SessionInfo };

// Resolves the current identity. With Entra wired, reads the NextAuth JWT
// session. Without it (local dev), falls back to the single DEV_ADMIN_EMAIL
// admin so development is unaffected. Returns null when nobody is signed in.
export async function getSession(): Promise<SessionInfo | null> {
  if (AUTH_ENABLED) {
    const session = await auth();
    if (!session?.user?.id || !session.user.email) return null;
    return {
      userId: session.user.id,
      email: session.user.email,
      name: session.user.name ?? null,
      role: session.user.role ?? UserRole.SDM,
    };
  }

  const email = env.DEV_ADMIN_EMAIL;
  if (!email) return null;
  const user = await prisma.user.upsert({
    where: { email },
    update: { role: UserRole.ADMIN },
    create: { email, name: "Dev Admin", role: UserRole.ADMIN },
    select: { id: true, email: true, name: true, role: true },
  });
  return { userId: user.id, email: user.email, name: user.name, role: user.role };
}

// Any signed-in Ovation user (admin or SDM). Bounces to sign-in if not.
export async function requireSession(): Promise<SessionInfo> {
  const session = await getSession();
  if (!session) redirect("/signin");
  return session;
}

// Admin-only. SDMs (or anonymous) get a 404 so admin areas are invisible, not
// just disabled. Used by admin pages and global mutation actions.
export async function requireAdmin(): Promise<SessionInfo> {
  const session = await getSession();
  if (!session) redirect("/signin");
  if (session.role !== UserRole.ADMIN) notFound();
  return session;
}

// Guards a single account by id. Admin passes through; an SDM must own it, else
// 404. Returns the session (with userId) for audit stamping. Used by account
// detail pages and account-scoped mutation actions.
export async function requireAccountAccess(accountId: string): Promise<SessionInfo> {
  const session = await requireSession();
  if (session.role === UserRole.ADMIN) return session;

  const owned = await prisma.clientAccount.findFirst({
    where: { id: accountId, sdmEmail: { equals: session.email, mode: "insensitive" } },
    select: { id: true },
  });
  if (!owned) notFound();
  return session;
}
