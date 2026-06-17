import "server-only";

// Back-compat shim. The real session logic now lives in ./session.ts (Entra
// JWT in prod, DEV_ADMIN_EMAIL fallback in dev). Existing call sites import
// `requireAdmin` from here; account-scoped sites should import
// `requireAccountAccess` / `accountScopeWhere` from ./session directly.
export { requireAdmin, getSession, requireSession } from "./session";
export type { SessionInfo as AdminSession } from "./session";
