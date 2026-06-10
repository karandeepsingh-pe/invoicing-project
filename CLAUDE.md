# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Status

**Tester-ready (2026-06-05).** Internal invoice automation web app, **live on Vercel + Neon** at
`invoicing-project-three.vercel.app` (Basic-auth gated). Admin UIs (orgs/accounts/rate cards/technicians),
timesheets, dispatch visits, the **invoice engine** (combined / dispatch / FSO xlsx), and misc fees are
**all built and tested** (269 unit tests). **Still pending:** real auth — Microsoft Entra ID + ADMIN/SDM
RBAC (Phase 3, `docs/auth-rbac-plan.md`); today everyone is the shared admin behind the password gate.

Reference data lives in a gitignored drop at `KD/KD/`.

### Current state & where to look (read before working on billing)
- **Full session log of the last build:** `docs/SESSION-2026-06-05.md`.
- **User manual / tester scenarios:** `docs/USER-MANUAL.md`, `docs/TESTING-SCENARIOS.md` (+ `.docx`).
- **Deploy + git-author gotcha + DB reset:** `docs/SESSION-2026-06-05.md` and `docs/DEPLOY.md`. Deploy with
  `vercel --prod --yes`, **commit as the team-owner email** (`karandeepstalwar@gmail.com`) or Vercel blocks
  the build (git-author protection). Dev + prod share one Neon DB.
- **Billing model (memorize the distinctions):**
  - **Dedicated** = day-rate basis (`ANNUAL_RATE`/`DAY_RATE`/`MONTHLY`, priority Day>Annual>Monthly) **or**
    hourly — chosen **per technician** (`Technician.dedicatedBillingBasis`). Plus **OT** (`OT_HOURLY_RATE`,
    hours > `defaultHours`/day) + weekend. Backfill vs No-Backfill = the slaId **tier toggle**. Rebadged techs
    bill off their own per-tech rates. Engine: `fte-rows.ts` → `dedicated-fte-calculator.ts`.
  - **Dispatch** = per-visit first-hour + per-hour split into **business / OOB(after the account's
    business-hours window end) / weekend**, from In/Out times; manual `oooHrs` fallback; per-ticket flat;
    full-day cap; TCS priority model. Engine: `dispatch-rows.ts` → `dispatch-calculator.ts` (+
    `dispatch-pricing-profiles.ts`).
  - **OT ≠ OOB.** OT = overtime (Dedicated, quantity-based). OOB = after-hours (Dispatch, time-of-day). Never
    conflate them.
  - **PH bills; PTO does not.** PH = 1 billable paid day (client pays for public holidays). PTO is paid to the
    technician but **not charged to the client** — 0 billable days (`statusDayCredit` in `cell.ts`; HALF_DAY =
    0.5, AB/NA = 0). A Dedicated row with PTO carries a "N PTO — paid, not billed" remark. (User-confirmed
    2026-06-10, superseding the brief both-non-billable rule.)
  - **Project / Scheduled** = per-band day/half/weekend/hourly (+ Project weekly/monthly + monthly cap).
  - **Misc fees** = % on subtotal + flat, via `assemble.ts`.
- **DB is masters-only after a handoff reset** (`KD/reset-to-masters.ts`). Demo data is rebuildable from the
  gitignored `KD/seed-*.ts` fixtures.

## Goal

Auto-generate two output formats from technician timesheets:

- **FSO** sheet — submitted to HCL
- **Pre-Invoice** sheet — submitted to all other client orgs (Cognizant, TCS, Wipro, …)

Replaces nine manual xlsx files currently in `KD/KD/` (gitignored — real client data).

## Entity Model

The user-facing term is **"Account"**, but in the Prisma schema the model is named **`ClientAccount`** (table `client_accounts`). This avoids a collision with NextAuth's `Account` model (which `@auth/prisma-adapter` reserves for OAuth provider links). Always say "Account" in copy, but `prisma.clientAccount.*` in code.

Each account carries a structured **rate sheet**: three top-level rate categories, master tables of SLAs and sub-categories, and an extensible per-account `AccountRate` matrix. Rate amounts are nullable so commercial teams can fill them in over time.

```
Org (HCL, Cognizant, TCS, Wipro, …)
 │  output_template: FSO (HCL) | PRE_INVOICE (default)
 │  default_currency: USD
 └─ ClientAccount (Acadia, ZF, JLL, EverSource, Hiscox, MAS_NJ, …)
     │  currency (defaults to org default)
     ├─ AccountRate rows — one per (sub-category, band 0..4, SLA, effective period)
     │     RateCategory (enum):
     │       ├─ DEDICATED        — single active assignment per technician
     │       ├─ PROJECT_TM
     │       └─ DISPATCH_SCHED   — dispatch + scheduled visit merged
     │     RateSubCategory (master table, extensible):
     │       e.g. ANNUAL_BACKFILL, HOURLY_BACKFILL_OT, FIRST_HOUR, FULL_DAY, …
     │     Sla (master table, extensible):
     │       NBD / SBD / 2BD / 3BD / 9X5X4 / 24X7X4 / SCHEDULE / NA
     └─ MiscFee rows — retainer, mileage, BGV, per diem, toolkit, …

Technician          → firstName, lastName, primaryCategory (RateCategory), band 0..4
                       belongs to one employer Org
Assignment          → Technician × ClientAccount × RateCategory; inherits rates from
                       AccountRate rows matching the technician's specific band
TimesheetEntry      → Assignment + date + hours (DATE-only at launch); entered by an SDM
InvoiceRun          → ClientAccount + period + format + file
User                → ADMIN | SDM
UserAccountAccess   → SDM × ClientAccount; data-scoping table
```

The DB-side half of the DEDICATED single-account constraint is a partial unique index in `prisma/migrations/<ts>_rate_sheet_v2/migration.sql`:

```sql
CREATE UNIQUE INDEX "assignment_dedicated_single_active"
  ON "assignments" ("technicianId")
  WHERE "endDate" IS NULL AND "rateCategory" = 'DEDICATED';
```

Application code must also enforce this on write — never rely on the index alone.

## Roles

- **Admin** — full read/write everywhere (orgs, accounts, rate cards, technicians, users).
- **SDM** (Service Delivery Manager) — scoped to accounts granted via `UserAccountAccess`. Can enter timesheets for any technician assigned to those accounts and generate invoices for those accounts. Cannot edit rate cards or org-level settings.

## Output Generation

On-demand only. SDM (or Admin) picks `(account, period)` → engine resolves Org → selects template (`FSO` for HCL, `PRE_INVOICE` otherwise) → loads all `TimesheetEntry` rows for the period via `Assignment` join → applies `RateCard` rates (FTE proration, hourly multiplication, per-visit, daily, etc.) → renders xlsx via **ExcelJS** using a template stored under `src/lib/invoice/templates/`.

**Reference layouts:** `KD/KD/*.xlsx` (gitignored). Read once to extract column headers, header rows, totals row positions, formulas. Generated output should be visually indistinguishable for downstream clients.

## Stack

- **Next.js 15** (App Router, TypeScript)
- **Postgres** (Neon or Supabase recommended)
- **Prisma** ORM
- **NextAuth** for auth (provider TBD: magic link / Google SSO / credentials)
- **ExcelJS** for xlsx generation
- **Zod** for boundary validation (xlsx import, API inputs)
- **Tailwind** + **shadcn/ui**
- **Vitest** (unit) + **Playwright** (E2E)

## Data Sensitivity

`KD/` is **gitignored**. Contains real client invoices, rate data, technician names. Never commit. Never paste cell contents into third-party tools. Treat as read-only reference for template extraction.

## Currency

USD only at launch. `Account.currency` field exists in schema for future multi-currency work — do **not** hardcode `'USD'` anywhere in render logic.

## Conventions

- **Immutability** — no in-place mutation (see `~/.claude/rules/common-coding-style.md`)
- Files **200–400 lines typical, 800 max**
- **Validate at boundaries**: xlsx parser, API routes, form submissions (Zod schemas)
- **TDD**: 80%+ coverage required (see `~/.claude/rules/common-testing.md`)
- **No hardcoded secrets** — env vars, validated at startup
- **FTE single-account constraint** enforced at application layer + DB partial unique index (`WHERE end_date IS NULL AND tech_type = 'FTE'`)
- **SDM data scoping** enforced at every query (middleware or Prisma extension), not just at UI

## Destructive Action Policy

**Always ask the user for authorization before running any destructive or hard-to-reverse action.** Do not infer permission from a related earlier approval — each destructive action needs its own explicit go-ahead.

Examples that always require an explicit prompt:

- `git push --force` / `git push --delete <branch>`
- `git reset --hard`, `git clean -fd`, `git branch -D` on shared branches
- `git rebase` on pushed branches
- `gh repo delete`, deleting GitHub issues / PRs / releases
- `rm -rf` on anything outside a clearly-scratch dir
- Dropping DB tables, truncating tables, destructive migrations
- Overwriting `KD/` or any tracked file beyond the immediate task
- Force-overwriting a remote (`gh repo create … --push` over an existing repo)

State exactly what will be deleted/overwritten and what cannot be undone before asking.

## Open Decisions

Surface to user before implementing the relevant slice:

- ✅ **Auth provider** — Microsoft Entra ID, restricted to `@ovationwps.com` (locked in for Phase 3).
- ✅ **Time zone model** — DATE-only `TimesheetEntry` (locked in; no `check_in`/`check_out` columns at launch).
- **Exact rate units per tech type** — user submitting pricing commercials later. Schema is flexible (per-row `rate_unit` + `rate_amount` + `ot_rate`).
- **File storage for generated xlsx** — Vercel Blob vs S3 vs local filesystem.
- **Hosting target** — Vercel vs cPanel (user has prior cPanel experience).
- **Audit retention policy** — how long to keep `InvoiceRun` records and generated files.
- **Mid-month FTE re-assignment** — billing split per Assignment vs disallow mid-month moves.

## Common Commands

```
pnpm install
pnpm dev               # local dev server (Next.js) on :3000
pnpm build && pnpm start
pnpm lint              # next lint
pnpm typecheck         # tsc --noEmit
pnpm test              # vitest (unit)
pnpm e2e               # playwright (needs dev server running)
pnpm db:migrate        # prisma migrate dev
pnpm db:seed           # tsx prisma/seed.ts (idempotent)
pnpm db:studio         # prisma studio
```

For local Postgres in this remote container, the system `postgresql` service is used and a `invoicing/invoicing` role + `invoicing` database are pre-created. `DATABASE_URL` defaults to `postgresql://invoicing:invoicing@localhost:5432/invoicing?schema=public` (see `.env.example`).

## Phased Build

1. ✅ **Bootstrap**: `CLAUDE.md`, `.gitignore`, `README.md`, Next.js 15 + TS + Tailwind, Vitest + Playwright, Zod env validation, Prisma client singleton
2. ✅ **Data model**: rate-sheet-v2 schema — RateCategory enum (3), Band 0..4, master tables for Sla and RateSubCategory, per-account AccountRate matrix, MiscFee, Technician (firstName/lastName/band/primaryCategory), Assignment.rateCategory, DEDICATED partial-unique index, idempotent seed including masters
3. **Auth + role middleware** (⏳ PENDING — only remaining major phase): NextAuth (Microsoft Entra ID, restricted to `@ovationwps.com`) + ADMIN/SDM RBAC + `UserAccountAccess` scoping. Today: shared admin behind a Basic-auth gate (`src/middleware.ts`).
4. ✅ **Admin CRUD UI**: orgs / accounts / rate cards / technicians (users come with Phase 3)
5. ✅ **Timesheet + dispatch UI**: per-account monthly grid (autosave); dispatch visit log with In/Out split + edit/delete
6. ✅ **Invoice generation engine**: ExcelJS — combined / dispatch / FSO pre-invoices; rate-sheet-driven (Dedicated day/hourly, Project, Scheduled, Dispatch, misc fees)
7. **Polish** (partial): soft-delete + restore done; multi-currency field present; audit via InvoiceRun. E2E full-flow + Entra auth still to come.

Full build plan with verification steps: `~/.claude/plans/mighty-scribbling-music.md` (also includes interview transcript appendix).

## Reference Data Drop

`KD/KD/` (gitignored) currently holds:

- `FSO_DataTemplatefor_ZFFRIEDRICHSHAFEN_Ovation.xlsx` — FSO template skeleton
- `FSO_ZFFRIEDRICHSHAFEN_Ovation_03-2026_8.xlsx` — populated FSO example
- `O_DEL_PRE JLL March 2026 PO#PO401170..xlsx` — JLL pre-invoice example
- `O_DEL_TCS March 2026 Invoice.xlsx` — TCS invoice example
- `O_Data_EverSource Energy_Ovation Mar.xlsx` — EverSource data export
- `Pre-invoice_O_DEL_Hiscox_BAU_Pre_Invoice_Jan 2026.xlsx` — Hiscox pre-invoice
- `Pre-invoice_O_DEL_MAS_NJ_BAU_Pre_Invoice_March 2026 - Up.xlsx` — MAS NJ pre-invoice
- `PreInvoice December 2025 Wipro.xlsx` — Wipro pre-invoice
- `ZFFRIEDRICHSHAFEN Pre-Invoice Apr'26.xlsx` — ZF pre-invoice

Filename patterns observed:

- `O_DEL_*` — delivery / final invoice variants
- `Pre-invoice_*` and `PreInvoice *` — pre-invoice drafts
- `FSO_*` — HCL-specific format
- `O_Data_*` — raw data exports
- Period encoded inline: `March 2026`, `Mar'26`, `Apr'26`, `03-2026`
