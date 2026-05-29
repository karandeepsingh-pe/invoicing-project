# Tech Stack

Pinned versions in `package.json`. This doc explain each choice + scale story.

## Summary Table

| Layer | Tech | Version | Role |
|-------|------|---------|------|
| Runtime | Node.js | 20+ LTS | Server runtime |
| Framework | Next.js | 15.1 (App Router) | SSR + RSC + server actions |
| Language | TypeScript | 5.7 | Static types end-to-end |
| UI | React | 19 | Component model |
| Styling | Tailwind CSS | 3.4 | Utility-first CSS |
| Components | shadcn/ui (planned) + custom | — | Headless primitives |
| Themes | next-themes | 0.4 | Dark/light toggle |
| Auth | NextAuth | 5.0-beta | Entra ID OIDC |
| Auth adapter | @auth/prisma-adapter | 2.7 | DB-backed sessions |
| ORM | Prisma | 6.2 | Type-safe DB access |
| DB | PostgreSQL | 15+ | Primary data store |
| Validation | Zod | 3.24 | Schema validation at boundaries |
| Xlsx engine | ExcelJS | (Phase 6) | Template-driven xlsx render |
| Unit test | Vitest | 2.1 | Fast unit tests |
| E2E test | Playwright | 1.50 | Browser-driven flows |
| Lint | ESLint + next-config | 9 / 15.1 | Static analysis |
| Format | Prettier | 3.4 | Code format |
| Package mgr | pnpm | 10.33 | Fast deterministic installs |

## Why Each Pick

### Next.js 15 (App Router)
- RSC = data fetch where data live, no API tier for internal app.
- Server actions = type-safe mutations without REST plumbing.
- Streaming SSR keep TTFB low even on rate-heavy admin pages.
- **Scale:** Stateless workers, horizontal scale. Vercel auto-scale or self-host behind LB. Routes split by segment — slow page no block fast page.

### TypeScript 5.7
- End-to-end types — DB → Prisma → action → component prop.
- Zod `.infer` give runtime + compile-time schema parity.
- **Scale:** Refactor safety as codebase grow. `tsc --noEmit` in CI catch breakage pre-merge.

### React 19
- Server Components first — ship less JS to client.
- New `use()` hook + actions integrate cleanly with Next.js server actions.
- **Scale:** Smaller bundle = faster client. Hydration cost flat as feature grow because most stay server-side.

### Tailwind 3.4
- Utility classes, no CSS-in-JS runtime cost.
- JIT compiler = only used classes ship.
- Easy theme variable wiring with `next-themes`.
- **Scale:** CSS size stay sub-50KB even at large UI surface.

### PostgreSQL
- Strong type system, decimals (`Decimal(12,4)` rate amounts).
- Partial unique indexes (DEDICATED single-active assignment guard).
- JSON column available if future flex needed.
- Managed Postgres (Neon / Supabase) offer point-in-time recovery, branch DBs for testing.
- **Scale:**
  - Connection pool via PgBouncer / Neon serverless driver.
  - Read replicas for reporting load.
  - Table partitioning for `timesheet_entries` if grow past tens of millions of rows.
  - Indexes already on hot lookup paths (see `prisma/schema.prisma`).

### Prisma 6
- Schema-first → migrations + typed client generate together.
- Migration history checked-in (`prisma/migrations/`).
- `onDelete: Cascade` declared at schema level.
- **Scale:**
  - Singleton client avoid connection blowout in serverless.
  - Prisma Accelerate / Data Proxy when need pool offload.
  - Multi-client setup for read replicas.

### NextAuth v5 + Entra ID
- OIDC against Microsoft Entra — domain lock to `@ovationwps.com`.
- DB-session via Prisma adapter — no JWT secret rotation pain, session revoke instant.
- **Scale:** Session lookup = one indexed query. Cheap. Adapter table already in schema (`auth_sessions`).

### Zod 3
- Schema = single source for form + action + parser.
- `.safeParse` → typed error mapping into UI.
- **Scale:** Every boundary validate same way. New endpoint = new schema, no framework lock-in.

### ExcelJS (Phase 6)
- Pure JS, no native deps — work on any Node host.
- Template-load + cell-mutate model match reference layout in `KD/`.
- Stream write for large workbook.
- **Scale:** CPU-bound. When p99 cross threshold → move to background worker (Inngest / BullMQ + Redis). Web tier stay snappy.

### Vitest + Playwright
- Vitest = jest-compatible API, faster, native ESM.
- Playwright = stable cross-browser E2E, traces + video on fail.
- **Scale:** Vitest parallel by default. Playwright shard across CI runners.

### pnpm
- Content-addressed store → fast install, deterministic lockfile.
- Workspace ready if monorepo split later.

## Scalability Story per Dimension

### Traffic
- Stateless Next.js workers → add instances horizontally.
- Static assets edge-cached.
- RSC fetch dedup within request.

### Data Volume
- Indexed hot paths.
- Object storage carry blob weight, DB stay lean.
- Partition + archive strategy ready for `timesheet_entries` + `invoice_runs`.

### Feature Surface
- Master tables (`Sla`, `RateSubCategory`) = add row, no migration.
- Server actions = new endpoint without route boilerplate.
- shadcn/ui = copy-paste component, no design-system version lock.

### Team
- Strict TS + Prisma schema = onboarding cheap.
- Server-action pattern uniform across features.
- TDD + 80% coverage requirement (CLAUDE) keep regressions visible.
- File-size cap (200–400 typical, 800 max) prevent god-modules.

### Cost
- Vercel hobby/pro scale linear with traffic.
- Neon/Supabase free tier cover dev + staging.
- Object storage cheap per GB.
- ExcelJS = no per-render license.

## Upgrade Path Notes

- Next 15 → 16: minor; App Router stable.
- React 19 → 20: stay on RSC, breaking change risk low.
- Prisma 6 → 7: re-run `prisma generate`, check deprecations.
- NextAuth beta → stable: monitor 5.x GA; current beta tagged.

## What Each Tech Replace If Removed

| Tech | If we drop | Replacement | Cost |
|------|-----------|-------------|------|
| Prisma | Drizzle / Kysely | Lose declarative migrations, gain raw SQL ergonomics | Medium |
| NextAuth | Lucia / Auth.js raw | More code, more control | Medium |
| Tailwind | CSS modules | More file overhead | Low |
| ExcelJS | exceljs streams / SheetJS | SheetJS faster but commercial license at scale | Low-Medium |
| Vitest | Jest | Slower, ESM headache | Low |

## Open Tech Decisions

(Mirror CLAUDE.md — surface when relevant slice start.)

- Blob storage: Vercel Blob vs S3 vs local fs.
- Hosting: Vercel vs cPanel.
- Job queue (when invoice gen go async): Inngest vs Vercel queues vs BullMQ.
- Audit log destination: same DB vs separate write-optimized store.
