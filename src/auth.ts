import NextAuth from "next-auth";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { authConfig, isAllowedEmail } from "@/auth.config";

// Full NextAuth instance (Node runtime). Extends the edge-safe authConfig with
// the DB-touching jwt/session callbacks. Used by the route handler, the sign-in
// page, and the server-side session helpers — never by the middleware.

function isAdminEmail(email: string): boolean {
  return env.ADMIN_EMAILS.includes(email.toLowerCase());
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    // First sign-in (when `user`/`profile` are present) resolves the email,
    // upserts a User row, and stamps role from the ADMIN_EMAILS allowlist. The
    // resulting userId/role/email ride on the JWT for the rest of the session,
    // so later requests need no DB lookup. Keeping a real User row preserves the
    // FK target for audit columns (InvoiceRun/Timesheet/Dispatch/Coverage).
    async jwt({ token, user, profile }) {
      const rawEmail =
        token.email ??
        user?.email ??
        (typeof profile?.email === "string" ? profile.email : undefined);
      const email = rawEmail?.toLowerCase();

      if (email && isAllowedEmail(email) && !token.userId) {
        const role = isAdminEmail(email) ? UserRole.ADMIN : UserRole.SDM;
        const name = (user?.name ?? (token.name as string | null) ?? null) || null;
        const dbUser = await prisma.user.upsert({
          where: { email },
          update: { role, ...(name ? { name } : {}) },
          create: { email, name, role },
          select: { id: true, role: true, name: true },
        });
        token.userId = dbUser.id;
        token.role = dbUser.role;
        token.email = email;
        token.name = dbUser.name;
      }
      return token;
    },
    session({ session, token }) {
      const userId = token.userId as string | undefined;
      if (userId) {
        session.user.id = userId;
        session.user.role = (token.role as UserRole | undefined) ?? UserRole.SDM;
        session.user.email = (token.email as string | undefined) ?? session.user.email;
        session.user.name = (token.name as string | null | undefined) ?? session.user.name;
      }
      return session;
    },
  },
});
