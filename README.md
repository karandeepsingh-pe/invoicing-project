# Invoicing Project

Internal web app that auto-generates client billing sheets — **FSO format** for HCL, **Pre-Invoice format** for all other client orgs — from technician timesheets and per-account rate cards.

Stack: **Next.js + Postgres**. See [`CLAUDE.md`](./CLAUDE.md) for architecture, entity model, roles, conventions, and open decisions.

**Status:** Phases 1–2 complete — Next.js scaffold + Prisma schema/migrations/seed land on `main` once merged. Auth (Phase 3) is next.

## Local setup

```
pnpm install
cp .env.example .env       # fill in DATABASE_URL if not using the default
pnpm db:migrate            # apply schema + FTE partial-unique index
pnpm db:seed               # idempotent: orgs + sample client accounts + admin user
pnpm dev                   # http://localhost:3000
```

Reference xlsx data lives under `KD/` (gitignored).
