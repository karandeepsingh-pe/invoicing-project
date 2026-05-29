# Architecture & Tech Stack

Internal invoice-automation web app. Replaces manual xlsx workflow for client billing. Server-rendered Next.js monolith backed by Postgres. On-demand xlsx generation. Internal use only — no public surface.

---

## 1. High-Level Architecture

```
                ┌────────────────────────────────────────────────┐
                │                Browser (Admin / SDM)           │
                │   React 19 + Tailwind + shadcn/ui components   │
                └───────────────┬────────────────────────────────┘
                                │  HTTPS (session cookie)
                ┌───────────────▼────────────────────────────────┐
                │           Next.js 15 (App Router)              │
                │  ┌──────────────┐  ┌────────────────────────┐  │
                │  │ React Server │  │ Server Actions /       │  │
                │  │ Components   │  │ Route Handlers         │  │
                │  └──────┬───────┘  └────────────┬───────────┘  │
                │  ┌──────▼───────────────────────▼───────────┐  │
                │  │ Auth (NextAuth v5 + Entra ID)            │  │
                │  │ Role / Account-scope middleware          │  │
                │  └──────┬───────────────────────────────────┘  │
                │  ┌──────▼───────────────────────────────────┐  │
                │  │ Domain services (lib/actions, lib/...)   │  │
                │  │  - rate resolution                       │  │
                │  │  - assignment guards                     │  │
                │  │  - invoice engine (ExcelJS)              │  │
                │  └──────┬───────────────────────────────────┘  │
                │  ┌──────▼───────────────────────────────────┐  │
                │  │ Prisma Client (singleton)                │  │
                │  └──────┬───────────────────────────────────┘  │
                └─────────┼──────────────────────────────────────┘
                          │
              ┌───────────▼────────────┐    ┌────────────────────┐
              │    PostgreSQL 15+      │    │  Object Storage    │
              │  (Neon / Supabase /    │    │  (Vercel Blob /    │
              │   managed Postgres)    │    │   S3 / fs)         │
              └────────────────────────┘    └────────────────────┘
```

### Layered Responsibilities

| Layer | Location | Job |
|-------|----------|-----|
| UI (RSC) | `src/app/**/page.tsx` | Render server components, fetch via Prisma directly |
| UI (Client) | `*-form.tsx`, `*-dialog.tsx`, `components/admin/*` | Forms, dialogs, toasts |
| Server Actions | `src/lib/actions/*.ts` | Mutations — Zod → guard → Prisma |
| Domain | `src/lib/display/*`, `src/lib/schemas/*` | Pure logic, validation |
| Persistence | `prisma/schema.prisma` | Postgres + partial-unique invariants |
| Auth | `src/lib/auth.ts` (Phase 3) | NextAuth v5 + Entra ID, `@ovationwps.com` lock |
| Invoice Engine | `src/lib/invoice/*` (Phase 6) | Period → rates → ExcelJS → blob |

### Request Lifecycle

1. Browser hit Next.js route.
2. Middleware check session + role.
3. RSC fetch via Prisma → stream HTML.
4. Form submit → server action: Zod parse → scope check → DB write → `revalidatePath`.
5. Invoice gen: server action stream xlsx → upload blob → write `InvoiceRun`.

### Key Invariants

- **DEDICATED single-account** — app layer + Postgres partial unique index. Both required.
- **SDM scoping** — every query filter on `UserAccountAccess`, not just UI.
- **Immutable updates** — no in-place mutation.
- **Nullable rate cells** — commercial team fill later.
- **DATE-only timesheets** — no clock in/out at launch.

### Invoice Data Flow

```
SDM picks (account, period)
  → resolve Org → pick template (FSO vs PRE_INVOICE)
  → load Assignments × TimesheetEntries
  → join AccountRate (band + sub-cat + SLA + effective period)
  → apply rate units (FTE / hourly / per-visit / daily)
  → ExcelJS render
  → blob upload + InvoiceRun row + signed URL
```

---

## 2. Tech Stack

| Layer | Tech | Version | Role |
|-------|------|---------|------|
| Runtime | Node.js | 20+ LTS | Server runtime |
| Framework | Next.js | 15.1 (App Router) | SSR + RSC + server actions |
| Language | TypeScript | 5.7 | End-to-end types |
| UI | React | 19 | Component model |
| Styling | Tailwind CSS | 3.4 | Utility-first CSS |
| Components | shadcn/ui + custom | — | Headless primitives |
| Themes | next-themes | 0.4 | Dark/light toggle |
| Auth | NextAuth | 5.0-beta | Entra ID OIDC |
| Auth adapter | @auth/prisma-adapter | 2.7 | DB-backed sessions |
| ORM | Prisma | 6.2 | Type-safe DB access |
| DB | PostgreSQL | 15+ | Primary data store |
| Validation | Zod | 3.24 | Boundary validation |
| Xlsx engine | ExcelJS | (Phase 6) | Template-driven xlsx |
| Unit test | Vitest | 2.1 | Fast unit tests |
| E2E test | Playwright | 1.50 | Browser flows |
| Lint | ESLint + next-config | 9 / 15.1 | Static analysis |
| Format | Prettier | 3.4 | Code format |
| Package mgr | pnpm | 10.33 | Deterministic installs |

### Why Each Pick (condensed)

- **Next.js 15** — RSC + server actions = no separate API tier. Streaming SSR.
- **TypeScript 5.7** — DB → action → component types unified via Prisma + Zod `.infer`.
- **React 19** — Server-first; smaller client bundle.
- **Tailwind 3.4** — JIT, no runtime cost. Theme via `next-themes`.
- **PostgreSQL** — Decimals, partial unique indexes, JSON column escape hatch.
- **Prisma 6** — Schema-first, migration history checked-in, singleton client.
- **NextAuth v5 + Entra ID** — Domain lock `@ovationwps.com`, DB sessions revocable.
- **Zod 3** — Single schema source for form + action + parser.
- **ExcelJS** — Pure JS, template-mutate model, stream write.
- **Vitest + Playwright** — Fast unit + stable E2E with traces.
- **pnpm** — Content-addressed store, deterministic.

---

## 3. Scalability

### Compute
- Stateless Next.js workers → horizontal scale, no sticky session.
- Static assets edge-cached.
- Invoice gen CPU-bound today inline; move to job queue (Inngest / BullMQ + Redis) when p99 >5s.

### Database
- Managed Postgres (Neon / Supabase) with PgBouncer / serverless driver.
- Hot-path indexes already in place:
  - `account_rates (clientAccountId, rateSubCategoryId)`, `(clientAccountId, band)`
  - `assignments (technicianId, startDate)`, `(clientAccountId, startDate)`
  - `timesheet_entries (date)`, unique `(assignmentId, date)`
  - `technicians (employerOrgId, active)`, `(primaryCategory, band)`
- Read replicas viable for reporting load.
- `timesheet_entries` partition candidate past ~50M rows.

### Storage
- Generated xlsx → object storage. DB keep only `InvoiceRun.fileUrl`.
- Bucket lifecycle rule cheap for retention.

### Schema Extensibility
- New SLA / sub-category = INSERT row, zero migration.
- New misc fee kind = enum extend.
- Rate matrix sparse via nullable cells.

### Multi-Tenancy / Currency
- Org model isolated — multi-tenant = scope-by-OrgId claim.
- `ClientAccount.currency` nullable, fall back org default. Render must not hardcode USD.

### Caching
- RSC fetch dedup per request.
- `revalidatePath` after mutation.
- Master tables (SLA, RateSubCategory) prime cache candidates.
- Future Redis layer for rate lookups in invoice batches.

### Failure Modes & Mitigation

| Failure | Mitigation |
|---------|------------|
| DB connection exhaust | PgBouncer / Neon pool tune |
| Invoice gen timeout | Background job queue |
| Concurrent rate edit | Optimistic concurrency via `updatedAt` |
| Template drift | Reference xlsx in `KD/` versioned, visual diff before release |
| Lost session | DB-backed sessions, re-auth via Entra |

### Deployment Targets (open)
- **Vercel** — auto-scale functions + edge + Vercel Blob + Neon Postgres.
- **cPanel** — Node behind nginx, managed Postgres + S3 bucket. Vertical scale until split justified.

---

## 4. Security

- Entra ID OIDC, domain lock `@ovationwps.com`.
- RBAC: `ADMIN` / `SDM`, scope via `UserAccountAccess`.
- Server-action-only mutations, no public REST.
- Zod validate every action input.
- Secrets via env, validated at startup.
- `KD/` gitignored, real client data.

---

## 5. Out of Scope (today)

- Public API
- Real-time collab on timesheets
- Mobile native client
- Cross-org reporting
