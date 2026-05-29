# Architecture

Internal invoice-automation web app. Replaces manual xlsx workflow for client billing. Server-rendered Next.js monolith backed by Postgres. On-demand xlsx generation. Internal use only — no public surface.

## High-Level Diagram

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
                │         │                       │              │
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

## Layered Responsibilities

| Layer | Location | Job |
|-------|----------|-----|
| UI (RSC) | `src/app/**/page.tsx` | Render server components, fetch via Prisma directly |
| UI (Client) | `*-form.tsx`, `*-dialog.tsx`, `components/admin/*` | Forms, dialogs, toasts, optimistic updates |
| Server Actions | `src/lib/actions/*.ts` | Mutations — validate (Zod) → guard (role + scope) → Prisma |
| Domain | `src/lib/display/*`, `src/lib/schemas/*` | Pure logic, label formatting, validation schemas |
| Persistence | `prisma/schema.prisma`, generated client | Postgres access; partial-unique indexes enforce invariants |
| Auth | `src/lib/auth.ts` (Phase 3) | NextAuth v5 + Entra ID, restricted to `@ovationwps.com` |
| Invoice Engine | `src/lib/invoice/*` (Phase 6) | Period → rates → ExcelJS render → object storage |

## Request Lifecycle

1. Browser hit Next.js route.
2. Middleware check session + role.
3. RSC fetch via Prisma → render HTML stream.
4. Form submit → server action.
5. Action: Zod parse → scope check (`UserAccountAccess`) → DB write → `revalidatePath`.
6. Heavy job (invoice gen): server action stream xlsx → upload blob → write `InvoiceRun` row → return URL.

## Key Invariants

- **DEDICATED single-account.** App layer + DB partial unique index (`assignment_dedicated_single_active`). Both required.
- **SDM scoping.** Every query filter on `UserAccountAccess` — enforced in action layer, not just UI.
- **Immutable updates.** No in-place mutation. Always new objects (per `common-coding-style.md`).
- **Rate cell nullability.** Commercial team fill amounts later; `AccountRate.rateAmount` nullable.
- **DATE-only timesheets.** No clock in/out at launch.

## Data Flow — Invoice Generation

```
SDM picks (account, period)
       │
       ▼
Server action: resolve Org → pick template (FSO vs PRE_INVOICE)
       │
       ▼
Load Assignments × TimesheetEntries for period
       │
       ▼
Join with AccountRate (band + sub-category + SLA + effective period)
       │
       ▼
Apply rate units (FTE proration / hourly / per-visit / daily)
       │
       ▼
Render via ExcelJS template (src/lib/invoice/templates/*.xlsx)
       │
       ▼
Persist blob → write InvoiceRun → return signed URL
```

## Scalability

### Compute

- **Stateless Next.js workers.** Session in DB (Prisma adapter). Scale horizontal — add more instances behind LB. No sticky session needed.
- **Edge vs node split.** RSC + actions run node runtime (Prisma require it). Static assets edge-cached.
- **Concurrency model.** Invoice gen CPU-bound (ExcelJS). Today: inline in server action. When >5s p99, move to job queue (Vercel queues / Inngest / BullMQ + Redis). Worker pool scale independent of web tier.

### Database

- Postgres on managed provider (Neon / Supabase) → connection pooling via PgBouncer / Neon serverless driver.
- Hot path indexes already in place:
  - `account_rates (clientAccountId, rateSubCategoryId)`, `(clientAccountId, band)`
  - `assignments (technicianId, startDate)`, `(clientAccountId, startDate)`
  - `timesheet_entries (date)`, unique `(assignmentId, date)`
  - `technicians (employerOrgId, active)`, `(primaryCategory, band)`
- Read replicas viable if reporting load grow — Prisma support read replicas via separate clients.
- Partitioning candidate: `timesheet_entries` by year if row count blow past ~50M.

### Storage

- Generated xlsx blobs go to object storage (Vercel Blob / S3). No file in DB.
- `InvoiceRun.fileUrl` only — keep DB row small.
- Retention policy open decision (per CLAUDE.md). Lifecycle rule on bucket cheap.

### Schema Extensibility

- New SLA / sub-category = INSERT into master table. Zero migration.
- New rate category = enum migration only (rare).
- New misc fee kind = enum extend (no schema reshape).
- Per-account rate matrix dense but sparse — nullable cells, no row needed until commercials known.

### Multi-Tenancy / Multi-Currency

- Single-tenant today (internal). Org model already separate, so multi-tenant addition = scope all queries by an `OrgId` claim.
- Currency live on `ClientAccount.currency` (nullable, fall back org default). Render logic must not hardcode USD.

### Caching Strategy

- RSC fetch dedup per request via Next.js cache.
- `revalidatePath` invalidate route segment after mutation.
- Master tables (SLA, RateSubCategory) prime cache candidates — load once per request.
- Future: Redis layer for resolved rate lookups if invoice batch grow large.

## Observability (planned)

- Structured logs (server-side) — error context per CLAUDE rule.
- Audit `InvoiceRun` already capture who/when.
- Add: action-level audit log table for rate-card edits (Phase 7).
- Health endpoint + DB ping.

## Security

- Entra ID auth, `@ovationwps.com` domain lock.
- RBAC: `ADMIN` / `SDM`. SDM scope via `UserAccountAccess`.
- Server-action only mutations — no public REST.
- Zod validate every action input.
- Secrets via env, validated at startup.
- `KD/` gitignored — real client data, read-only reference.

## Deployment Topology

Two viable targets (open decision in CLAUDE.md):

**Vercel (preferred for scale):**
- Auto-scaling functions, edge cache, blob storage built-in.
- Postgres via Neon (serverless driver, autoscale).

**cPanel (legacy ops familiarity):**
- Node app behind nginx, managed Postgres separate.
- Object storage = S3-compatible bucket or local disk.
- Single VM scale vertical until invoice load justify split.

## Failure Modes & Mitigation

| Failure | Mitigation |
|---------|------------|
| DB connection exhaust | PgBouncer / Neon pool; Prisma `connection_limit` tune |
| Invoice gen timeout | Move to background job queue when latency cross threshold |
| Concurrent rate edit | Optimistic concurrency via `updatedAt` check (future) |
| Template drift vs client expectation | Reference xlsx in `KD/` versioned externally; visual diff before release |
| Lost session | DB-backed sessions; user re-auth via Entra |

## Out of Scope (today)

- Public API
- Real-time collab on timesheets
- Mobile native client
- Cross-org reporting
