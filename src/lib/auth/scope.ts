import { Prisma, UserRole } from "@prisma/client";

// Pure, server-only-free auth scoping helpers (so they're unit-testable without
// pulling in NextAuth). session.ts re-exports these.

export type SessionInfo = {
  userId: string;
  email: string;
  name: string | null;
  role: UserRole;
};

// Prisma where-fragment that scopes ClientAccount list queries to the caller:
// admin sees everything; an SDM sees only accounts they own by email. Blank-SDM
// accounts (sdmEmail null) never match an SDM -> admin-only by design.
export function accountScopeWhere(session: SessionInfo): Prisma.ClientAccountWhereInput {
  if (session.role === UserRole.ADMIN) return {};
  return { sdmEmail: { equals: session.email, mode: "insensitive" } };
}
