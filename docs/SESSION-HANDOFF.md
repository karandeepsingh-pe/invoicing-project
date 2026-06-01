# Session handoff — context for continuing this project

Written 2026-06-01 so a fresh assistant (or developer) on a new workspace has the full
picture of what was built in this session, why, and what is left. Pair this with
`CLAUDE.md` (architecture/entity model), `docs/DEPLOY.md` (how to ship), and
`docs/auth-rbac-plan.md` (the next milestone).

## Project in one paragraph
Internal Next.js 15 (App Router) + Prisma + Postgres app that auto-generates client
billing sheets from technician timesheets and per-account rate cards. Two output styles:
FSO (HCL) and Pre-Invoice (everyone else). The user-facing term is "Account"; the Prisma
model is `ClientAccount`. Money math is deterministic and unit-tested — no LLM ever
computes a monetary value. Style preference throughout: plain language, no em dashes.

## Current status
Phases 1–2 (scaffold, schema, seed) and the invoice engine are done. This session added
the full four-engagement-type combined invoice, made billing fully data-driven, and made
the app deployable to Vercel + Neon (no in-app login yet). Verified green:
`pnpm typecheck`, `pnpm lint`, `pnpm exec vitest run` (174 tests), `pnpm build`,
`prisma validate`.

---

## What this session delivered (4 workstreams)

### 1. Dedicated FTE billing: band rate stored as an exact annual; per-tech is an override
Background: an earlier fix switched Dedicated FTE day-rate to monthly proration
`dayRate = (annual / 12) / businessDaysInMonth`, billed `× daysWorked`, so a fully-worked
month bills exactly `annual / 12` (matches the reference FSO/JLL sheets). This session
finished the rate-source model:
- The per-band dedicated salary is now stored as an **exact annual** on the rate sheet
  (the `ANNUAL_RATE` sub-category), not as an hourly figure. Previously it was stored as
  `annual / 2080` and reconstructed `× 2080`, which lost cents.
- `src/lib/invoice/billing-basis.ts`: added `pickBandAnnual(annualRowAmount, hourlyRowAmount)`
  — prefer the exact annual row, else bridge a legacy hourly row `× 2080`. Removed the
  now-unused `annualToHourly`.
- `src/lib/invoice/fte-rows.ts` `resolveRates`: `annual = perTechAnnual > 0 ? perTechAnnual : bandAnnual`.
  Non-rebadged techs use the per-band annual; a per-technician `annualSalary` overrides it
  (within-band exceptions and rebadged techs). Rebadged still controls only OT/weekend source.
- `src/lib/actions/account-rate.ts`: a dedicated `ANNUAL_RATE` entry persists as a raw annual
  (dropped the `/2080` conversion).
- UI: `rebadged-fields.tsx` reframes the per-tech field as "Annual rate override (optional)";
  `create-rate-form.tsx` drops the legacy hourly day-rate option for Dedicated (annual only).

### 2. Four-engagement-type combined pre-invoice (JLL/Cognizant parity)
Decoded a real JLL/Cognizant pre-invoice and matched every billing rule. The four types:
- **FTE (Dedicated):** `annual/12/businessDays × daysWorked` (above). Per-tech/per-band annual,
  with backfill vs no-backfill via the SLA tier.
- **Project / T&M:** `min(daysWorked × FullDayRate, MonthlyRate)`. A full month caps at the
  flat monthly; a partial month bills per day. `project-calculator.ts` reads the `MONTHLY`
  sub-category for the cap. The monthly is a CEILING, so a short full month (e.g. 20 business
  days) bills per-day under the cap (this is the user's chosen behavior, matches the JLL).
- **Scheduled:** NEW 4th rate category. Timesheet-driven, per-day, no monthly cap.
  `extended = fullDays × FullDay + halfDays × HalfDay` (Half Day is its own rate, not 0.5×Full).
  Files: `scheduled-calculator.ts`, `scheduled-rows.ts`.
- **Dispatch:** per visit `min(FirstHourSLArate + (hours−1) × T&M_hourly, FullDayCap)`, then
  × OOBH (1.5) or × Weekend/PH (2.0) multipliers (no stacking; weekend/PH wins). Public
  holidays auto-detected from the `Holiday` master; Sat/Sun auto-detected from the date.
  Cancelled visits bill 0. `dispatch-calculator.ts`, `dispatch-rows.ts`.
- **Combined output:** ONE summary sheet with all four types in a unified table, then TOTAL,
  then a Project Management Fee (% of subtotal, from `MiscFee.percent`), then grand total.
  The detailed dispatch visit tracker is a separate tab in the same workbook.
  `render-pre-invoice.ts` gained `writePreInvoiceSheet(...)` (extracted, reusable) + a
  `literalExtended` row flag (for monthly-capped Project rows and per-visit Dispatch rows
  where Extended ≠ dayRate × daysWorked). `render-combined-invoice.ts` and
  `generate-combined-invoice.ts` were rewritten to merge FTE+Project+Scheduled+Dispatch and
  apply the fee via the existing `assembleInvoice` (HALF_UP, 2dp).

Oracle numbers (asserted in unit tests): Project 22d → 8,800 (capped), 20d → 8,200; Scheduled
Hill 9d × 410 = 3,690; Dispatch 90+2×65=220, 90+4.2×65=363, 8h capped 410, weekend 8h = 820.

### 3. Fully data-driven billing (account defaultHours)
Audited the money path for hardcoded values. The one gap: `project-rows.ts` and
`scheduled-rows.ts` hardcoded an 8-hour day for the full-day threshold. Both now read the
account's `defaultHours` (like `fte-rows.ts`). Tests assert a 9-hour cell is a full day at
`defaultHours=8` but a partial/half day at 10. Everything else (rates, days/hours, annual,
band, business days, holidays, fees) was already data-driven.

### 4. Deployment readiness (Vercel + Neon) + auth/RBAC design doc
The user wants to deploy for testers now, with NO in-app login yet, and the full RBAC
designed for later.
- `package.json`: `postinstall: prisma generate`, `vercel-build: prisma migrate deploy && next build`.
- `src/lib/env.ts`: empty-string optional env vars are coerced to undefined (fixes the
  `NEXTAUTH_SECRET=""` 500 footgun). `.env.example` cleaned up with Neon guidance.
- `src/app/admin/layout.tsx` already had `export const dynamic = "force-dynamic"`, so admin
  pages do not prerender at build time.
- `docs/DEPLOY.md`: click-by-click Vercel + Neon (DB, env vars, deploy, seed once,
  **Deployment Protection**, smoke test).
- Deliberately did NOT add Prisma `directUrl`/`DIRECT_URL` — it breaks local dev when unset
  and is unnecessary at test scale (a single Neon connection string serves runtime +
  migrations). Pooled+direct is noted as a future scaling step.

---

## Key files (by area)
- Billing math (pure, unit-tested): `src/lib/invoice/billing-basis.ts`,
  `dedicated-fte-calculator.ts`, `project-calculator.ts`, `scheduled-calculator.ts`,
  `dispatch-calculator.ts`, `assemble.ts`, `period.ts`, `hours-split.ts`, `coverage.ts`.
- Row loaders (DB → rows): `fte-rows.ts`, `project-rows.ts`, `scheduled-rows.ts`,
  `dispatch-rows.ts`.
- Renderers: `render-pre-invoice.ts` (+ `writePreInvoiceSheet`), `render-combined-invoice.ts`,
  `render-dispatch.ts`, `render-project.ts`.
- Generators (server actions): `src/lib/actions/generate-{pre,combined,project,dispatch}-invoice.ts`.
- Rate sheet model: `prisma/schema.prisma` (`RateCategory` now has DEDICATED, PROJECT_TM,
  DISPATCH_SCHED, SCHEDULED), `prisma/seed.ts` (sub-categories), `account-rate.ts`.
- Auth (current stub): `src/lib/auth/dev-session.ts` (`requireAdmin` reads `DEV_ADMIN_EMAIL`).
- Docs: `docs/DEPLOY.md`, `docs/auth-rbac-plan.md`, this file.

## Decisions & rationale (so they are not re-litigated)
- Dedicated full month always = `annual/12` (proration), per-tech annual overrides band.
- Project monthly is a CEILING (per-day capped), not a floor — matches the JLL even in short
  months.
- Scheduled is its own `RateCategory` (4th), timesheet-driven, distinct from per-visit Dispatch.
  Scheduled techs reuse the dispatch availability flag (`isAvailableForDispatch`); shown as a
  third timesheet tab.
- Dispatch OOBH/Weekend/PH are MULTIPLIERS on a full-day-capped base (1.5 / 2.0), sourced from
  the rate sheet (`OOBH_MULTIPLIER` / `WEEKEND_PH_MULTIPLIER` sub-categories) with those
  defaults when unset. The old rate-replacement OUT_OF_OFFICE/WEEKEND interpretation is dropped.
- Money path stays deterministic + unit-tested; rounding HALF_UP to 2dp in `assembleInvoice`.

## NOT done / next steps
1. **Auth + RBAC (designed in `docs/auth-rbac-plan.md`, not built):** Microsoft Entra ID
   sign-in restricted to `@ovationwps.com`; ADMIN (full) + SDM (scoped to their accounts via
   the existing `UserAccountAccess` table); SDM can manage timesheets + download invoices for
   their accounts only; admin assigns accounts to SDMs (many-to-many). Schema + NextAuth
   adapter tables + `next-auth@5`/`@auth/prisma-adapter` already exist; only wiring is needed.
2. **Execute the deploy** (user-owned): push to GitHub, create Neon DB, import to Vercel, set
   env vars, seed once, enable Deployment Protection. See `docs/DEPLOY.md`.
3. The `<3 months` vs `>3 months` Project monthly split is intentionally collapsed to one
   `MONTHLY` rate; revisit only if those rates ever diverge.

## Caveats & gotchas
- **No auth today:** a deployed instance is open admin to anyone with the URL (the dev
  `requireAdmin` does not check a logged-in user). Keep it behind Vercel Deployment Protection
  until Entra ID auth lands.
- Local dev uses a Docker/local Postgres; production uses Neon. `pnpm db:seed` is run manually
  against Neon once (not on every deploy).
- Reference client data lives under `KD/` (gitignored) — never commit it.
- The active per-task plan file (`~/.claude/plans/floating-imagining-flurry.md`, outside the repo) is
  reproduced verbatim in Appendix A below so it travels with the repo. Earlier plan iterations in that file
  (band-rate refinement, four-type invoicing, data-driven hours) were overwritten as the session progressed;
  their substance is in workstreams 1-3 above.

---

## Appendix A: active plan file (verbatim)

As-built note: A1 and A3 below mention a Prisma `directUrl` / `DIRECT_URL` split. That was intentionally NOT
implemented — it breaks local dev when the var is unset and is unnecessary at test scale (a single Neon
connection string serves both runtime and migrations). Everything else in this plan was implemented as
written. See workstream 4 for the rationale.

> # Plan: deploy to Vercel + Neon now (no login); design RBAC + Entra ID auth for later
>
> Style: plain language, no em dashes.
>
> ## Context
> The prior multi-engagement invoicing build is done and verified. The user now wants the app DEPLOYED to
> Vercel + Neon Postgres so they and a few testers can use it as-is (the current single-admin experience), with
> NO in-app login yet. The full Microsoft Entra ID auth + ADMIN/SDM RBAC + account-to-SDM assignment is to be
> PLANNED and DOCUMENTED for a later pass, not built now.
>
> Decisions (from the user): (1) skip login for now, plan it for later; (2) host on Vercel + Neon; (3) skip SDM
> scoping for now, keep the current admin experience.
>
> ### Honest risk to surface
> With login skipped, the deployed app is reachable by anyone with the URL at full admin (the current
> `requireAdmin()` in `src/lib/auth/dev-session.ts` is a dev stub that reads `DEV_ADMIN_EMAIL` and does NOT
> verify a logged-in user). Mitigation for the test phase, zero code: turn on Vercel Deployment Protection.
>
> ### Already deploy-friendly (no change)
> Invoice files return to the browser as base64 (no server file storage). Schema + 22 migrations + idempotent
> seed are in place. `next-auth` is installed but unused, so it does not affect the build.
>
> ## Part A — Build now: Vercel + Neon deploy readiness
> - A1. Prisma datasource for Neon (pooled `url` + `directUrl`). [NOT implemented — see as-built note above.]
> - A2. `package.json`: add `postinstall: prisma generate` and `vercel-build: prisma migrate deploy && next build`.
> - A3. Env hardening (`src/lib/env.ts` + `.env.example`): coerce empty-string optional vars to undefined so a
>   copied `.env` does not 500 on `NEXTAUTH_SECRET=""`. (The `DIRECT_URL` part was dropped — see as-built note.)
> - A4. `src/app/admin/layout.tsx`: `export const dynamic = "force-dynamic"` (already present).
> - A5. `docs/DEPLOY.md` (Vercel + Neon click-by-click) + README deployment pointer.
> - A6. Verify: typecheck / lint / vitest / `pnpm build` / `prisma validate` all green.
>
> ## Part B — Document now, build later: RBAC + Microsoft Entra ID auth
> Deliverable: the committed design doc `docs/auth-rbac-plan.md` (full design, no runtime code this pass).
> The schema is already ready (`User`, `UserRole {ADMIN, SDM}`, `UserAccountAccess`, and the NextAuth
> `Account`/`Session`/`VerificationToken` tables). The doc specifies: auth wiring (`src/auth.ts` +
> `[...nextauth]` route + `middleware.ts`); restrict sign-in to `@ovationwps.com`; replace the dev gate with
> real `requireAdmin()` + add `requireUser()` and `requireAccountAccess(accountId)`; the ADMIN-only vs
> SDM-allowed action surface (SDM = timesheet save, dispatch-visit create/delete, coverage create/delete, the
> four generate-*-invoice actions); scope the four account-list pages; role-based sidebar; the many-to-many
> account-to-SDM assignment UI; and first-admin bootstrap.
>
> ## Files
> Part A: `prisma/schema.prisma`, `package.json`, `src/lib/env.ts`, `.env.example`, `src/app/admin/layout.tsx`,
> `docs/DEPLOY.md` (new), `README.md`. Part B: `docs/auth-rbac-plan.md` (new design doc).
>
> ## Verification
> Part A: typecheck / lint / tests green; `pnpm build` succeeds; `prisma validate` passes; `prisma migrate
> deploy` applies all migrations to a fresh DB. Part B: `docs/auth-rbac-plan.md` covers the full design.

The complete, expanded version of Part B (turnkey for implementation) is `docs/auth-rbac-plan.md`.
