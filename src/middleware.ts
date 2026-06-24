import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import type { NextRequest, NextFetchEvent, NextMiddleware } from "next/server";
import { authConfig, AUTH_ENABLED } from "@/auth.config";

// Two-mode gate:
//
//  1. Entra configured (AUTH_ENABLED) -> real NextAuth sign-in, restricted to
//     the Ovation tenant. The JWT cookie is verified at the edge with the shared
//     secret (no DB hit); the DB-touching callbacks live in src/auth.ts.
//  2. Entra NOT configured -> interim HTTP Basic-auth gate using
//     BASIC_AUTH_USER / BASIC_AUTH_PASSWORD. This keeps a deployed instance
//     private for testers until Entra env vars are set in Vercel. When those are
//     also unset (local dev) the gate is a no-op so development is unaffected.
//
// Once Entra env vars are live in production, mode 1 takes over automatically and
// the BASIC_AUTH_* vars can be removed.

/**
 * Interim shared-password gate. Returns a 401 response to block the request, or
 * null to allow it (credentials valid, or gate disabled because BASIC_AUTH_* is
 * unset). Used only when Entra is not configured.
 */
function basicAuthChallenge(req: NextRequest): NextResponse | null {
  const user = process.env.BASIC_AUTH_USER;
  const pass = process.env.BASIC_AUTH_PASSWORD;

  // No credentials configured -> gate disabled (local dev default).
  if (!user || !pass) return null;

  const header = req.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    // atob is available in the Edge runtime middleware executes in.
    const decoded = atob(header.slice("Basic ".length));
    const separator = decoded.indexOf(":");
    const suppliedUser = decoded.slice(0, separator);
    const suppliedPass = decoded.slice(separator + 1);
    if (suppliedUser === user && suppliedPass === pass) return null;
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Ovation Invoicing", charset="UTF-8"',
    },
  });
}

// Edge-runtime NextAuth gate. Only the edge-safe authConfig is imported here (no
// Prisma) — the JWT cookie is verified with the shared secret, no DB hit.
const { auth } = NextAuth(authConfig);

// auth() returns an overloaded handler; called as `(request, event)` the runtime
// function is a standard edge middleware, so we type it as one.
const entraGate = auth((req) => {
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
}) as unknown as NextMiddleware;

export default function middleware(req: NextRequest, ev: NextFetchEvent) {
  // Entra configured -> real sign-in gate.
  if (AUTH_ENABLED) return entraGate(req, ev);


  // Entra off -> interim shared-password gate (prod) / no-op (local dev). The
  // NextAuth machinery is intentionally not invoked here, so a missing
  // NEXTAUTH_SECRET in this mode can never throw.
  return basicAuthChallenge(req) ?? NextResponse.next();
}

// Gate every route except Next.js build assets and the favicon. API routes and
// server actions are intentionally included so data access is gated too.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
