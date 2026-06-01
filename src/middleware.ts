import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Shared-password gate for the pre-auth deployment phase.
//
// The app has no in-app login yet (every request is treated as a single admin;
// see src/lib/auth/dev-session.ts). To keep a deployed instance private for
// testers without a paid Vercel plan, this middleware enforces HTTP Basic auth
// whenever BASIC_AUTH_USER and BASIC_AUTH_PASSWORD are both set. When either is
// unset (local dev) the gate is a no-op, so local development is unaffected.
//
// Remove this once Microsoft Entra ID auth lands (docs/auth-rbac-plan.md).
export function middleware(req: NextRequest) {
  const user = process.env.BASIC_AUTH_USER;
  const pass = process.env.BASIC_AUTH_PASSWORD;

  // No credentials configured -> gate disabled (local dev default).
  if (!user || !pass) {
    return NextResponse.next();
  }

  const header = req.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    // atob is available in the Edge runtime middleware executes in.
    const decoded = atob(header.slice("Basic ".length));
    const separator = decoded.indexOf(":");
    const suppliedUser = decoded.slice(0, separator);
    const suppliedPass = decoded.slice(separator + 1);
    if (suppliedUser === user && suppliedPass === pass) {
      return NextResponse.next();
    }
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Ovation Invoicing", charset="UTF-8"',
    },
  });
}

// Gate every route except Next.js build assets and the favicon. API routes and
// server actions are intentionally included so data access is gated too.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
