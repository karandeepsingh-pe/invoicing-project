import type { NextAuthConfig } from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

// Edge-safe NextAuth config. This file MUST NOT import Prisma (or anything that
// pulls it in) — it is bundled into the Edge-runtime middleware. The DB-touching
// `jwt`/`session` callbacks live in src/auth.ts (Node runtime) instead.

export const ALLOWED_DOMAIN = "@ovationwps.com";

/** True when an email belongs to the Ovation tenant (the hard app-wide gate). */
export function isAllowedEmail(email?: string | null): email is string {
  return typeof email === "string" && email.toLowerCase().endsWith(ALLOWED_DOMAIN);
}

// Entra is only wired when all three secrets are present. When it isn't (local
// dev), AUTH_ENABLED is false and the middleware/session helpers fall back to
// the DEV_ADMIN_EMAIL identity so development is unaffected.
export const AUTH_ENABLED =
  !!process.env.AUTH_MICROSOFT_ENTRA_ID_ID &&
  !!process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET &&
  !!process.env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID;

// Single-tenant issuer locks the OAuth flow to the Ovation directory. The email
// gate in `signIn` is enforced regardless, so even a misconfigured tenant can't
// let a non-Ovation account in.
const issuer = process.env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID
  ? `https://login.microsoftonline.com/${process.env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID}/v2.0`
  : undefined;

export const authConfig = {
  trustHost: true,
  // Sign the JWT with the same secret in both runtimes. Dev fallback keeps local
  // `auth()` calls working when no secret is set; prod must set NEXTAUTH_SECRET.
  secret:
    process.env.NEXTAUTH_SECRET ??
    (process.env.NODE_ENV === "production"
      ? undefined
      : "dev-only-insecure-secret-change-me-0000000000"),
  session: { strategy: "jwt" },
  pages: { signIn: "/signin", error: "/signin" },
  providers: AUTH_ENABLED
    ? [
        MicrosoftEntraID({
          clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID!,
          clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET!,
          issuer,
          authorization: { params: { scope: "openid profile email User.Read" } },
        }),
      ]
    : [],
  callbacks: {
    // Hard tenant gate. Runs where sign-in completes (Node runtime). Returning
    // false sends the user to /signin?error=AccessDenied.
    signIn({ user, profile }) {
      const email =
        user?.email ??
        (typeof profile?.email === "string" ? profile.email : undefined) ??
        (typeof profile?.preferred_username === "string"
          ? profile.preferred_username
          : undefined);
      return isAllowedEmail(email);
    },
  },
} satisfies NextAuthConfig;
