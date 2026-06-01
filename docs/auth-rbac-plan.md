# Auth + RBAC design (Microsoft Entra ID, ADMIN/SDM, per-account scoping)

Status: **designed, not built.** This is the next milestone after the no-login Vercel
deploy. It captures everything needed to implement real authentication and role-based
access so the implementation is mechanical.

## Goal
- Sign in with a Microsoft work account, restricted to `@ovationwps.com`.
- Two roles: **ADMIN** (full access to everything) and **SDM** (Service Delivery
  Manager), scoped to the specific accounts they own.
- An SDM can manage **timesheets** and generate/download **invoices** for their accounts
  only. They cannot touch rate cards, orgs, technicians, users, or the global masters.
- Account-to-SDM is **many-to-many**: an SDM can own several accounts, and an account can
  have several SDMs. Admins assign these.

## Already in place (no schema work needed)
- Models (`prisma/schema.prisma`): `User` (with `role`), `UserRole { ADMIN, SDM }`,
  `UserAccountAccess` (the SDM x ClientAccount join, unique on `(userId, clientAccountId)`),
  and the NextAuth adapter tables `Account` / `Session` / `VerificationToken`.
- Dependencies: `next-auth@5` (beta) and `@auth/prisma-adapter` are installed.
- Env schema (`src/lib/env.ts`): `AUTH_MICROSOFT_ENTRA_ID_ID` / `_SECRET` / `_TENANT_ID`
  and `NEXTAUTH_SECRET` already validated (optional today).
- The current gate `src/lib/auth/dev-session.ts#requireAdmin()` already has the right
  call shape (returns `{ userId, email, name }`); it just needs a real implementation.

## 1. Auth wiring
- **`src/auth.ts`** — configure NextAuth v5:
  - `MicrosoftEntraID` provider using the three `AUTH_MICROSOFT_ENTRA_ID_*` env vars.
  - `PrismaAdapter(prisma)` so users/sessions persist via the existing adapter tables.
  - Session strategy: database sessions (adapter) or JWT; JWT is simplest on Vercel.
  - Export `auth`, `signIn`, `signOut`, and `handlers`.
- **`src/app/api/auth/[...nextauth]/route.ts`** — `export const { GET, POST } = handlers`.
- **`src/middleware.ts`** — wrap with `auth`; redirect unauthenticated requests for
  `/admin/*` to the sign-in page. Matcher: `["/admin/:path*"]`.
- **Env additions**: add `NEXTAUTH_URL` to `src/lib/env.ts` (the deployment origin) and
  make `NEXTAUTH_SECRET` + the three Entra vars effectively required in production
  (validate when `NODE_ENV === "production"`).
- **Azure setup (one-time, by an admin)**: register an app in Entra ID, add the redirect
  URI `https://<domain>/api/auth/callback/microsoft-entra-id`, create a client secret,
  and copy client id / secret / tenant id into the Vercel env.

## 2. Restrict to the org
- `signIn` callback: reject any profile whose email does not end in `@ovationwps.com`
  (return `false`). Optionally also pin the tenant id to the Ovation tenant.

## 3. Session shape
- `jwt` / `session` callbacks attach to the session: `user.id`, `user.role`, and
  `user.accessibleAccountIds: string[]` (the `clientAccountId`s from `UserAccountAccess`
  for that user). ADMINs get a sentinel meaning "all" (or the code simply skips scoping
  when `role === ADMIN`).

## 4. Guards (replace the dev gate)
In `src/lib/auth/` (evolve `dev-session.ts` or add `session.ts`):
- `requireUser()` → the authenticated user (role + id) or redirect to sign-in.
- `requireAdmin()` → `requireUser()` + assert `role === ADMIN` (keeps today's call sites
  working unchanged).
- `requireAccountAccess(accountId)` → `requireUser()`; ADMIN passes; SDM must have a
  `UserAccountAccess` row for `accountId`, else throw/redirect 403.
- Keep `DEV_ADMIN_EMAIL` as a **local-dev only** bypass (guarded by
  `NODE_ENV !== "production"`) so local work needs no Azure.

## 5. Enforcement surface (from the code audit)
Keep **ADMIN-only** (already call `requireAdmin()`; leave as-is):
- `org.ts`, `client-account.ts`, `account-rate.ts`, `assignment.ts`, `technician.ts`,
  `misc-fee.ts`, `invoice-run.ts`, and all masters: `sla.ts`, `rate-sub-category.ts`,
  `visit-type.ts`, `holiday.ts`, plus postal-code / geocode helpers.

Switch to **`requireAccountAccess(accountId)`** (SDM-allowed for their accounts):
- `timesheet.ts#saveTimesheetMonth` (accountId in payload)
- `dispatch-visit.ts#createDispatchVisit` / `#deleteDispatchVisit` (accountId via the
  visit's assignment)
- `coverage.ts#createCoverageEvent` / `#deleteCoverageEvent` (accountId via the covered
  assignment)
- `generate-pre-invoice.ts`, `generate-combined-invoice.ts`, `generate-project-invoice.ts`,
  `generate-dispatch-invoice.ts` (accountId in payload)

For actions that resolve the accountId from a fetched row (dispatch/coverage), look up the
accountId first, then call `requireAccountAccess`.

## 6. Scope the account-list queries
Filter ClientAccount lists by the SDM's access (ADMIN sees all). Sites:
- `src/app/admin/accounts/page.tsx`
- `src/app/admin/invoices/page.tsx`
- `src/app/admin/timesheets/page.tsx`
- `src/app/admin/management/page.tsx` (filter the nested accounts under each org)

Pattern:
```ts
const user = await requireUser();
const where = user.role === "SDM"
  ? { userAccountAccess: { some: { userId: user.id } } }
  : {};
await prisma.clientAccount.findMany({ where, ... });
```
Also guard the per-account detail pages (`timesheets/[accountId]`, `dispatch-visits/[accountId]`,
`invoices/generate/[accountId]/*`) with `requireAccountAccess(params.accountId)`.

## 7. Role-based navigation
`src/components/admin/sidebar.tsx` takes the role (passed from `admin/layout.tsx`, which
already loads the session). SDM sees only **Timesheets**, **Invoices**, **Dispatch**;
hide Management and all Masters. ADMIN sees everything.

## 8. Account-to-SDM assignment (the many-to-many piece)
Data already supports it (`UserAccountAccess`). Build, in order of effort:
- **Minimal (first):** on the account detail page (`accounts/[accountId]`), an "SDM access"
  panel to grant/revoke users (creates/deletes `UserAccountAccess` rows). Server actions
  `grantAccountAccess(userId, accountId)` / `revokeAccountAccess(...)`, ADMIN-only.
- **Users page (next):** `/admin/users` — list users, set role (ADMIN/SDM), and assign
  multiple accounts per SDM from one screen.
- **Polished (later):** bulk assignment, an SDM directory, and an audit of who can see what.

## 9. First-admin bootstrap + new users
- The seed creates `admin@ovationwps.com` as ADMIN. On first real login, promote the
  intended admin(s) — either via the seed (an `ADMIN_EMAILS` env allowlist applied in the
  `signIn`/`jwt` callback) or a one-off script.
- New Entra logins default to `role = SDM` with **no** account access until an admin grants
  it (they sign in but see an empty account list). Decide whether to auto-provision a
  `User` row on first login (the Prisma adapter does this) and default role SDM.

## 10. Rollout + testing
- Add the Azure app + env vars; deploy; verify a non-allowlisted Google/personal account
  is rejected and a `@ovationwps.com` account signs in.
- E2E (Playwright): ADMIN sees all accounts + masters; SDM sees only granted accounts,
  can save a timesheet + download an invoice for those, and gets 403 on a non-granted
  account and on any rate-card/master action.
- Unit-test `requireAccountAccess` (ADMIN passes; SDM with/without the row).

## Open questions
- Session strategy: JWT vs database sessions (JWT simpler on serverless; DB sessions give
  instant revocation).
- Should revoking an SDM's last account hide the whole app for them, or show an empty
  state with a "request access" note.
- Audit logging of invoice downloads per user (ties into the existing `InvoiceRun` record,
  which already has `generatedById`).
