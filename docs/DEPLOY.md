# Deploying to Vercel + Neon

This guide stands up a testable instance of Ovation Invoicing on **Vercel** (app) +
**Neon** (Postgres). It reflects the current state: there is **no in-app login yet**
(see the security note at the bottom and `docs/auth-rbac-plan.md` for the planned
Microsoft Entra ID + role-based access work).

## What you get
The app runs as a single shared admin. Anyone who can reach the URL has full admin
access, so step 6 (Deployment Protection) is required to keep it private during testing.

---

## 1. Create the database (Neon)
1. Sign up at https://neon.tech and create a project (any region close to your Vercel region).
2. In the project dashboard, open **Connection Details** and copy the connection string.
   Use the **Pooled connection** string. It looks like:
   `postgresql://USER:PASSWORD@ep-xxxx-pooler.REGION.aws.neon.tech/neondb?sslmode=require`
3. Keep this handy — it is your `DATABASE_URL`.

## 2. Import the repo into Vercel
1. Push this repo to GitHub (see the project README for the remote).
2. At https://vercel.com → **Add New → Project** → import the GitHub repo.
3. Framework preset is auto-detected as **Next.js**. Package manager **pnpm** is picked
   up from `packageManager` in `package.json`. Leave the build command on the default —
   Vercel automatically runs the `vercel-build` script, which is
   `prisma migrate deploy && next build` (so migrations apply on every deploy).

## 3. Set environment variables (Vercel → Settings → Environment Variables)
Add these for **Production** (and Preview if you want preview deploys):

| Name | Value |
|------|-------|
| `DATABASE_URL` | the Neon pooled connection string from step 1 |
| `DEV_ADMIN_EMAIL` | your email, e.g. `kstalwar@ovationwps.com` (the shared admin identity) |
| `SOFT_DELETE_ENABLED` | `true` (so delete + restore work for testers) |
| `NEXT_PUBLIC_APP_NAME` | `Ovation Invoicing` (optional) |

`NODE_ENV` is set to `production` by Vercel automatically. Do **not** set the
`NEXTAUTH_*` / `AUTH_MICROSOFT_*` vars yet — they are unused until the auth pass.

## 4. First deploy
Trigger a deploy (push to the connected branch, or **Deploy** in the dashboard).
The `vercel-build` script runs `prisma migrate deploy`, applying all migrations to
the empty Neon database, then builds the app.

## 5. Seed the masters + sample data (one time)
The seed is not run automatically. From your local machine, point it at Neon and run it once:

```bash
# PowerShell
$env:DATABASE_URL="<your Neon pooled connection string>"; pnpm db:seed

# bash
DATABASE_URL="<your Neon pooled connection string>" pnpm db:seed
```

This creates the SLA / sub-category / visit-type / holiday masters, the admin user,
and the sample orgs/accounts. It is idempotent (safe to re-run). If you would rather
start empty and enter your own orgs/accounts, you can skip seeding — but the rate-sheet
masters (SLAs, sub-categories) are needed for billing, so run at least the masters.

## 6. Lock it down (required while there is no login)
Vercel → project **Settings → Deployment Protection** → enable **Vercel Authentication**
or a **Password**. Share the password with your testers. This keeps the open-admin
instance off the public internet until in-app Microsoft login is built.

## 7. Smoke test
Open the deployment URL and confirm:
- The admin dashboard loads.
- A timesheet saves (Timesheets → an account → enter hours → save).
- An invoice downloads (Invoices → an account → Generate combined → the xlsx downloads).

---

## Updating later
Push to the connected branch → Vercel redeploys → `prisma migrate deploy` applies any
new migrations automatically. No manual migration step needed for normal updates.

## Notes / future scaling
- At higher concurrency you would split the connection: a pooled `DATABASE_URL` for
  runtime plus a direct `DIRECT_URL` for migrations (Prisma `directUrl`). Not needed at
  test scale; the single pooled URL is fine.
- Generated invoice files stream to the browser (base64), so no blob/object storage is
  required.
- Real authentication (Microsoft Entra ID) and ADMIN/SDM roles are designed in
  `docs/auth-rbac-plan.md` and are the next milestone.
