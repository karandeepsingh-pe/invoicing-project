# Ovation Invoicing — Architecture Overview
### Proof of Concept → Production (Microsoft-native)

**Prepared by:** Karan
**Date:** 2026-06-18
**Purpose:** Set out the architecture of the current proof of concept, the production target inside the
Microsoft / Azure ecosystem, and a clear what-replaces-what mapping — for sign-off before the next phase.

---

## 1. Context

The current build is a **proof of concept**, approved in our architecture call to validate the billing and
invoice-generation logic before committing to the production setup. That objective is met: the engine
produces accurate, client-ready invoices (FSO for HCL, Pre-Invoice for others).

The PoC was built deliberately on **portable, industry-standard technology with no proprietary lock-in**, so
moving to a fully Microsoft-native production architecture is a **hosting and configuration change, not a
rebuild**. Identity has been on **Microsoft Entra ID** from the start.

This document is the basis for agreeing the production architecture and the ISO 27001 compliance approach.

---

## 2. Current architecture (Proof of Concept)

| Layer | Technology | Notes |
|-------|-----------|-------|
| Application | Next.js 15 (TypeScript) | Standard framework; no platform-proprietary features used |
| Hosting | Vercel | PoC hosting for fast iteration |
| Database | PostgreSQL on Neon | Standard PostgreSQL; no proprietary extensions |
| Identity / sign-in | **Microsoft Entra ID** (`@ovationwps.com` only) | Already in our tenant |
| Invoice output | ExcelJS (in-app) | Generates the .xlsx; downloaded manually today |
| Geocoding (minor) | Local postal-code table, with a public API fallback | Fallback used only when not in the local table |

**Email:** none today — invoices are generated and sent manually (automated delivery was not in PoC scope).

---

## 3. Production target (Microsoft-native)

| Layer | Technology | Outcome |
|-------|-----------|---------|
| Application | Next.js 15 (unchanged) | Same code |
| Hosting | **Azure App Service** (Linux, Node) | App runs inside the tenant |
| Database | **Azure Database for PostgreSQL (Flexible Server)** | Same engine; data inside Microsoft |
| Identity | **Microsoft Entra ID** (unchanged) | No change |
| Secrets | **Azure Key Vault** + App Service config | Governed in the tenant |
| Email | **Microsoft Graph** from an Ovation mailbox (e.g. `billing@ovationwps.com`) | Invoices / reminders / alerts from our address, recorded in Exchange |
| Geocoding | **Azure Maps** or local table only | Removes the last external call |
| CI/CD | **GitHub Actions → Azure (OIDC)** or Azure DevOps | Microsoft toolchain |

**Result:** zero non-Microsoft infrastructure vendors — one tenant, one security review, one contract.

---

## 4. What replaces what

| Current (PoC) | Production (Microsoft) | Change type |
|---------------|------------------------|-------------|
| Vercel (hosting) | Azure App Service | Re-host (no code rewrite) |
| Neon (PostgreSQL, on AWS) | Azure Database for PostgreSQL | Connection-string + data copy (same engine) |
| Vercel environment variables | Azure Key Vault + App Service config | Config move |
| *(no email)* | Microsoft Graph email from Ovation mailbox | New capability, inside the tenant |
| Public geocoding API (fallback) | Azure Maps / local table | Remove external dependency |
| Microsoft Entra ID | Microsoft Entra ID | **No change — already Microsoft** |
| GitHub deploys | GitHub Actions → Azure (OIDC) | Pipeline move |

---

## 5. What stays exactly the same

- The **application code** and the **billing / invoice-generation logic** (already built and validated).
- **PostgreSQL** as the database engine (Neon and Azure are the same engine).
- **Microsoft Entra ID** identity and the `@ovationwps.com` access gate.
- The **data model** and all existing features.

Because of this, the migration is **behavior-preserving** — the app works identically; only where it runs
and where the data lives change.

---

## 6. Compliance posture (ISO 27001)

| Concern | Production answer |
|---------|------------------|
| Data residency | All data inside Azure / the Microsoft tenant |
| Sub-processors / vendor review | Single vendor (Microsoft) under existing agreements |
| Access control | Microsoft Entra ID, restricted to `@ovationwps.com`, role-based (Admin / SDM) |
| Secrets management | Azure Key Vault, managed identity |
| Email records | Microsoft Graph from a real mailbox → Exchange Sent Items + retention / journaling |
| Auditability | Sign-in via Entra; invoice runs and email sends logged |

---

## 7. Migration approach & status

- **Effort:** contained. The only application code change is one build setting; everything else is hosting,
  configuration, a one-time data copy, and pipeline setup.
- **Risk:** low — behavior-preserving, PostgreSQL → PostgreSQL, with the PoC kept live as a fallback during
  cutover.
- **Status:** architecture mapped and ready; awaiting sign-off on the production design and the compliance
  approach before execution.

---

## 8. Proposed next step

A short working session (Karan + KD + Amit) to: confirm the production architecture above, agree the ISO
27001 compliance approach, and set clear sign-off checkpoints for the production build.
