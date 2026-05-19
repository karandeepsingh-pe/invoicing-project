# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Status

**Scaffold phase.** Internal invoice automation web app. Replaces manual xlsx generation for client billing. Next.js + Postgres, hosted (target: Vercel or cPanel). No code exists yet — only this doc, `.gitignore`, `README.md`, and a reference data drop at `KD/KD/` (gitignored).

Before scaffolding `package.json` or any source code, surface the **Open Decisions** section to the user.

## Goal

Auto-generate two output formats from technician timesheets:

- **FSO** sheet — submitted to HCL
- **Pre-Invoice** sheet — submitted to all other client orgs (Cognizant, TCS, Wipro, …)

Replaces nine manual xlsx files currently in `KD/KD/` (gitignored — real client data).

## Entity Model

```
Org (HCL, Cognizant, TCS, Wipro, …)
 │  output_template: FSO (HCL) | PRE_INVOICE (default)
 │  default_currency: USD
 └─ Account (Acadia, ZF, JLL, EverSource, Hiscox, MAS_NJ, …)
     │  currency (defaults to org default)
     └─ RateCard rows — one per (tech type, rate unit, effective period)
         ├─ FTE              — dedicated; locked to single account
         ├─ Project          — flexible; multi-account
         ├─ Dispatch         — flexible; multi-account
         └─ Scheduled Visit  — flexible; multi-account

Technician          → belongs to one employer Org; one primary type
Assignment          → Technician × Account; multi-row for flexible techs, single active row for FTE
TimesheetEntry      → Assignment + date + hours (+ check_in?/check_out?); entered by an SDM
InvoiceRun          → Account + period + format + file; audit record per generation
User                → ADMIN | SDM
UserAccountAccess   → SDM × Account; data-scoping table
```

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

## Open Decisions

Surface to user before implementing the relevant slice:

- **Exact rate units per tech type** — user submitting pricing commercials later. Schema is flexible (per-row `rate_unit` + `rate_amount` + `ot_rate`).
- **Auth provider** — magic link vs Google SSO vs credentials.
- **File storage for generated xlsx** — Vercel Blob vs S3 vs local filesystem.
- **Hosting target** — Vercel vs cPanel (user has prior cPanel experience).
- **Audit retention policy** — how long to keep `InvoiceRun` records and generated files.
- **Time zone model** — DATE-only entries vs date + local time (HH:MM in account tz). Decide before Phase 4 (SDM timesheet UI).
- **Mid-month FTE re-assignment** — billing split per Assignment vs disallow mid-month moves.

## Common Commands

*To be populated once `package.json` exists. Anticipated:*

```
pnpm install
pnpm dev               # local dev server (Next.js)
pnpm build && pnpm start
pnpm test              # vitest
pnpm e2e               # playwright
pnpm prisma migrate dev
pnpm prisma studio
```

## Phased Build

1. **Bootstrap** (this commit): `CLAUDE.md`, `.gitignore`, `README.md`
2. **Data model**: Prisma schema + migrations (Org, Account, RateCard, Technician, Assignment, TimesheetEntry, InvoiceRun, User, UserAccountAccess)
3. **Auth + role middleware**: NextAuth + ADMIN/SDM RBAC + `UserAccountAccess` scoping
4. **Admin CRUD UI**: orgs / accounts / rate cards / technicians / users
5. **SDM timesheet UI**: per-account monthly grid; tech × day cells; account auto-tagged
6. **Invoice generation engine**: template-driven xlsx via ExcelJS; FSO + Pre-Invoice templates extracted from `KD/KD/` reference files
7. **Polish**: audit log, exports, multi-currency activation, E2E test of full flow

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
