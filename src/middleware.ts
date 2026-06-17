import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig, AUTH_ENABLED } from "@/auth.config";

// Edge-runtime auth gate. Only the edge-safe authConfig is imported here (no
// Prisma) — the JWT cookie is verified with the shared secret, no DB hit. The
// DB-touching jwt/session callbacks live in src/auth.ts and never run here.
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  // Dev fallback: when Entra isn't configured, the app runs as the single dev
  // admin (see src/lib/auth/session.ts) and the gate is a no-op.
  if (!AUTH_ENABLED) return NextResponse.next();

  const { pathname } = req.nextUrl;

  // Always allow the auth endpoints and the sign-in page itself.
  if (pathname.startsWith("/api/auth") || pathname === "/signin") {
    return NextResponse.next();
  }

  // No valid session -> bounce to sign-in, remembering where they were headed.
  if (!req.auth) {
    const signInUrl = new URL("/signin", req.nextUrl.origin);
    if (pathname !== "/") signInUrl.searchParams.set("callbackUrl", req.nextUrl.href);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
});

// Gate every route except Next.js build assets and the favicon. API routes and
// server actions are intentionally included so data access is gated too.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
