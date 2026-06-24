import type { UserRole } from "@prisma/client";
import type { DefaultSession } from "next-auth";

// Augment the session + JWT with our app-specific identity fields populated by
// the auth.ts callbacks.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: UserRole;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    role?: UserRole;
  }
}
