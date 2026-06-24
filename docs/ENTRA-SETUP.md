# Microsoft Entra ID sign-in — setup runbook

This wires real sign-in (restricted to `@ovationwps.com`) plus per-SDM account
visibility. Until the four env vars below are set, the app falls back to the
`DEV_ADMIN_EMAIL` identity, so local dev keeps working with no login.

## How it works (so the steps make sense)
- **`src/auth.config.ts`** (edge-safe) holds the Entra provider + the
  `@ovationwps.com` `signIn` gate. The middleware uses it to gate every route.
- **`src/auth.ts`** (Node) upserts a `User` on first sign-in and stamps the role:
  email in `ADMIN_EMAILS` → `ADMIN`, everyone else → `SDM`.
- An **SDM** sees only accounts whose `sdmEmail` equals their signed-in email
  (case-insensitive). Admins see everything. Accounts with no SDM are admin-only.
- Session is a **JWT** (no DB session rows) — light on serverless, and it's what
  lets the edge middleware verify auth without touching Postgres.

## 1. Register the app in Azure (Entra admin center → App registrations → New)
- **Name:** `Ovation Invoicing`
- **Supported account types:** *Accounts in this organizational directory only*
  (single tenant — Ovation).
- **Redirect URI** (type **Web**) — add one per environment you'll sign in from:
  - `http://localhost:3000/api/auth/callback/microsoft-entra-id` (local dev)
  - `https://<your-vercel-preview>.vercel.app/api/auth/callback/microsoft-entra-id`
  - `https://invoicing-project-three.vercel.app/api/auth/callback/microsoft-entra-id` (prod)
- Click **Register**.

## 2. Collect the three IDs/secrets
- **Overview** page → copy **Application (client) ID** → `AUTH_MICROSOFT_ENTRA_ID_ID`
- **Overview** page → copy **Directory (tenant) ID** → `AUTH_MICROSOFT_ENTRA_ID_TENANT_ID`
- **Certificates & secrets → New client secret** → copy the **Value** (not the
  Secret ID; it's only shown once) → `AUTH_MICROSOFT_ENTRA_ID_SECRET`
- **API permissions:** Microsoft Graph → Delegated → `openid`, `profile`,
  `email`, `User.Read` (these are usually present by default; add if missing).
  No admin consent needed for these delegated scopes.

## 3. Generate the session secret
```
openssl rand -base64 32
```
→ `NEXTAUTH_SECRET`.

## 4. Set the env vars
**Vercel** (Project → Settings → Environment Variables — set for **Preview** and
**Production** as you promote):
```
NEXTAUTH_SECRET=<from step 3>
AUTH_MICROSOFT_ENTRA_ID_ID=<client id>
AUTH_MICROSOFT_ENTRA_ID_SECRET=<client secret value>
AUTH_MICROSOFT_ENTRA_ID_TENANT_ID=<tenant id>
ADMIN_EMAILS=kstalwar@ovationwps.com   # comma-separated; everyone else is SDM
```
**Local `.env`** (optional — only if you want to test real sign-in locally):
same five vars. Leave them unset to keep the DEV_ADMIN_EMAIL fallback.

## 5. Deploy order (do NOT skip the preview)
1. **Apply the migration** `add_account_sdm` to Neon first
   (`pnpm prisma migrate deploy`, or it runs automatically via `vercel-build`).
   Additive + nullable — safe, no backfill.
2. **Deploy to a Vercel PREVIEW** with the env vars set on Preview.
3. On the preview URL: sign in with an `@ovationwps.com` account → should land
   in. Try a non-Ovation account → should be rejected ("That account isn't
   allowed."). Confirm an SDM sees only their accounts; an `ADMIN_EMAILS` user
   sees everything; admin areas 404 for an SDM.
4. Only then **promote to Production** and set the same vars on Production.
5. After prod sign-in works, **remove `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD`**
   from prod (the Entra gate replaces them).

## Rollback
All pre-auth work is the commit tagged in the PR base. To revert: redeploy that
commit and clear the Entra env vars (the middleware falls back to the
Basic-auth/dev behavior when Entra is unconfigured).

## Assigning accounts to SDMs
- Per account: edit the account → **SDM owner** group (name + `@ovationwps.com`
  email + optional phone). The SDM who signs in with that email then sees it.
- Bulk: the account upload template has `SDM Name` / `SDM Email` / `SDM Phone`
  columns at the end. Blank = admin-only until assigned.
