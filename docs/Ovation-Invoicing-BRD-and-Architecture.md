# Ovation Invoicing — Business Requirements & Architecture

*Part 1 — Business Requirements  ·  Part 2 — Architecture (Proof of Concept → Production)*

---

# Part 1 — Business Requirements

# Business Requirements Document — Ovation Invoicing

**Product:** Ovation Invoicing — internal invoice automation for managed-services delivery
**Audience:** Stakeholders, delivery leads, finance, security review
**Status legend:** ✅ Built & in use  ·  🟡 Built, not yet switched on  ·  🔵 Planned (roadmap)
**Last updated:** 2026-06-17

---

## 1. Purpose & scope

Ovation delivers technicians to client organisations (HCL, Cognizant, TCS, Wipro, …) under several
commercial models. Each month the team must turn technician time and dispatch visits into accurate,
client-ready invoices. Historically this was nine hand-maintained Excel files.

Ovation Invoicing replaces that manual work: it holds the clients, their commercial rate sheets, the
technicians and their assignments, captures the monthly timesheets and dispatch visits, and **generates the
client invoice on demand** in the exact format each client expects (FSO for HCL, Pre-Invoice for everyone
else).

This document describes **how the system works end to end** — the operating workflow from onboarding a
client through to a delivered, approved invoice — the **role-based access model**, the **approval-by-email
workflow**, and the near-term roadmap (Microsoft-native hosting + Microsoft Graph email).

---

## 2. Roles & access model

Access is gated by **Microsoft Entra ID** sign-in, restricted to `@ovationwps.com` accounts. 🟡
A person's capabilities depend on their role; data visibility is **row-level by account ownership**.

| Role | Who | Can see | Can do |
|------|-----|---------|--------|
| **Admin** | Operations / finance owners (allowlist) | **All** clients & accounts | Everything: manage clients, accounts, rate cards, technicians, master data, users; generate **and approve** invoices |
| **SDM** (Service Delivery Manager) | Delivery managers | **Only their own accounts** (where the account's SDM email = their sign-in email) | Enter timesheets, log dispatch visits, generate invoices for their accounts, **submit invoices for approval**. Cannot edit rate cards, clients, or master data |
| **Approver** 🔵 | Admin / Finance | Items routed to them | Approve or reject a prepared invoice before it reaches the client |

**Key access rules**
- **Domain gate:** only `@ovationwps.com` identities can sign in (everything else is rejected). 🟡
- **Row-level scoping:** an SDM sees an account only when `account.sdmEmail` matches their email. Admin areas
  (rate cards, clients, masters, technicians) are hidden from SDMs **and** blocked server-side. ✅ (logic) / 🟡 (live)
- **Every account has an owning SDM** (name + `@ovationwps.com` email + phone), set when the account is
  created. Accounts with no SDM are admin-only until one is assigned. ✅

---

## 3. End-to-end process workflow

The operating pipeline, in order. Steps 1–8 are **built and in use**; the approval and email steps (9–10)
are the planned target state.

### Step 1 — Onboard a client (Org) ✅
An Admin creates the **Client** record (e.g. HCL, TCS). The client carries its **output template**
(FSO for HCL; Pre-Invoice for all others), default currency, and the bill-to / remittance block shown on
generated invoices.
> *Output:* a client that accounts can be created under.

### Step 2 — Add an account under the client ✅
An Admin creates an **Account** (the billing unit, e.g. "ZF — Dedicated Support") under the client. At
creation the account is given its **SDM owner** (name, `@ovationwps.com` email, phone) — this drives who can
see and act on it — plus the client POC contact, billing address, currency, and dispatch billing settings.
> *Output:* an account owned by an SDM, ready for a rate sheet.

### Step 3 — Set the rate sheet for the account ✅
An Admin fills the account's **rate sheet**: a matrix of rate amounts across **rate category**
(Dedicated · Project/T&M · Dispatch/Scheduled), **band (0–4)**, **SLA**, and sub-category (first-hour,
full-day, annual-backfill, etc.). **Misc fees** (retainer, mileage, BGV, per diem, project-management %)
are added here too. Rates can be filled in over time as commercials are agreed.
> *Output:* the pricing the engine will apply when invoicing this account.

### Step 4 — Add technicians ✅
An Admin adds **technicians** (name, employer, band 0–4, primary category, contact details, employment
**start date**, location). Rebadged technicians can carry their own per-tech rates.
> *Output:* the people who can be assigned to accounts.

### Step 5 — Assign a technician to the account ✅
An Admin creates an **Assignment** (technician × account × rate category) with a start date (and optional
end date). The assignment inherits the account's rates at the technician's band. A Dedicated technician can
hold only one active assignment at a time. The assignment defines the **active window** that the monthly
timesheet bills against.
> *Output:* the link that makes a technician billable on this account — and seeds the monthly timesheet.

### Step 6 — The monthly timesheet ✅
For each account and month, the assignment produces a **timesheet grid** (one row per assigned technician,
one cell per day). An SDM (or Admin) enters hours and day-codes; the grid **autosaves**:
- A **number** = hours worked (weekday hours over the day's standard become OT; weekend hours bill to the
  weekend bucket).
- **PH** public holiday · **AB** absent · **PTO** paid-not-billed · **HALF_DAY** · **NA** not applicable.
- Blank weekdays inside the assignment window pre-fill to standard hours on reload.
- **Dispatch visits** are logged separately (in/out times → business / after-hours / weekend split, tickets,
  travel, parts).
> *Output:* the month's billable time, ready to invoice.

### Step 7 — Edit / adjust the timesheet ✅
The SDM corrects cells, records **coverage events** (a pool technician covering a backfill seat), and
resolves exceptions (missing cells, unpriced rows, cancelled dispatch visits) surfaced on the dashboard.
> *Output:* a clean, reconciled month.

### Step 8 — Generate the invoice ✅
The SDM (or Admin) picks **(account, month)** and the engine resolves the client → selects the template →
loads the timesheet/dispatch data → applies the rate sheet → renders the **client-ready Excel workbook**.
Each workbook bundles the **Pre-Invoice (or FSO)** sheet plus a **Timesheet**, a **Rate Sheet** (filled
rates), and a **Remittance Advice** sheet. HCL accounts also get the FSO category sheets. Every run is
logged (who, when, format).
> *Output:* the invoice workbook (currently downloaded in the browser).

### Step 9 — Approval by email 🔵 *(target state)*
Before an invoice reaches the client it is **routed for approval**:
1. The SDM marks the generated invoice **"Submit for approval."**
2. An **approval-request email** is sent to the designated **Approver** (Admin/Finance) — from the Ovation
   mailbox — with the invoice attached and an **Approve / Reject** action.
3. The Approver **approves** (invoice → *Approved*) or **rejects** (returned to the SDM with notes).
4. On approval, the invoice is **emailed to the client** automatically and marked *Issued*.

> *Output:* a controlled, audited release — no invoice goes to a client without sign-off.

### Step 10 — Deliver, remind, alert 🔵 *(target state)*
- **Invoice delivery:** the approved invoice is emailed to the client POC (cc the SDM) **from a real Ovation
  mailbox** (e.g. `billing@ovationwps.com`), so it originates from Ovation's address and is recorded in
  Exchange Sent Items + retention/journaling.
- **Payment reminders:** automated reminders go out before/after the due date (Net-30 by default) until the
  invoice is marked paid.
- **Operational alerts:** SDMs get a scoped digest (missing timesheets, unpriced rows, un-generated
  accounts late in the month); Admins get a tenant-wide exception digest.

---

## 4. Approval & email workflow (detail) 🔵

```
SDM generates invoice ──► Submit for approval
        │
        ▼
  Approval request email ──► Approver (Admin/Finance)
        │                         │
   (reject + notes)          (approve)
        │                         │
        ▼                         ▼
 back to SDM to fix     Invoice emailed to client (from billing@ovationwps.com)
                                  │
                                  ▼
                        Status: Issued ──► Payment reminders until Paid
```

**Email touchpoints**

| Email | Trigger | From | To | Recorded |
|-------|---------|------|----|----------|
| Approval request | SDM submits invoice | Ovation mailbox | Approver | Exchange Sent Items |
| Approval decision | Approver approves/rejects | Ovation mailbox | SDM | Exchange Sent Items |
| Invoice delivery | Approval granted | Ovation mailbox | Client POC (cc SDM) | Exchange Sent Items + retention |
| Payment reminder | Due-date schedule | Ovation mailbox | Client POC (cc SDM) | Exchange Sent Items |
| Operational alert | Scheduled digest | Ovation mailbox | SDM (own accounts) / Admin (all) | Exchange Sent Items |

All email is sent via **Microsoft Graph** from a controlled shared mailbox (least-privilege, locked to that
one mailbox) — no third-party mail vendor.

---

## 5. Billing model at a glance ✅

| Model | Basis | Notes |
|-------|-------|-------|
| **Dedicated** | Day-rate (annual ÷ 12 ÷ business-days-excl-PH) or hourly, per technician | + OT (hours over the day standard) + weekend; Backfill vs No-Backfill tier |
| **Dispatch** | Per-visit first-hour + per-hour, split business / after-hours / weekend | From in/out times; per-ticket flat; full-day cap; TCS priority model |
| **Project / T&M** | Per-band day / half-day / weekend / hourly | + weekly/monthly + monthly cap |
| **Scheduled** | Per-band day / half / weekend / hourly | Scheduled visits |
| **Misc fees** | % on subtotal + flat | Retainer, mileage, BGV, per diem, toolkit |

**Rules:** OT (overtime, quantity) ≠ OOB (out-of-business-hours, time-of-day). Public holidays reduce the
business-day denominator (never billed as a worked day). PTO is paid to the technician but **not charged**
to the client.

---

## 6. Outputs ✅

| Client | Template | Workbook contents |
|--------|----------|-------------------|
| **HCL** | **FSO** | FSO category sheets (Dedicated / Project Work / Dispatch / SV) + Combined Pre-Invoice + Timesheet + Rate Sheet + Remittance |
| **All others** (Cognizant, TCS, Wipro, …) | **Pre-Invoice** | Pre-Invoice + Timesheet + Rate Sheet + Remittance |

Output is on-demand; the generated workbook is intended to be visually indistinguishable from the manual
files clients receive today.

---

## 7. Roadmap / future state 🔵

| Item | Outcome | Status |
|------|---------|--------|
| **Microsoft Entra sign-in + SDM scoping** | `@ovationwps.com`-only access; SDMs see only their accounts | 🟡 Built (PR #10); pending Azure app registration + go-live |
| **Move hosting + database into Microsoft Azure** | Zero non-Microsoft vendors; one security review/contract. Behavior-preserving (Postgres→Postgres) — the app works identically | 🔵 Planned |
| **Microsoft Graph email** | Invoices, approvals, reminders, alerts sent from a real Ovation mailbox, recorded in Exchange | 🔵 Planned |
| **Invoice approval workflow** | No invoice reaches a client without approval; full audit | 🔵 Planned |
| **Payment status tracking** | Issue/due dates, paid status — drives reminders | 🔵 Planned |

---

## 8. Assumptions & constraints

- All users are Ovation staff with `@ovationwps.com` Microsoft accounts.
- USD at launch (multi-currency field exists for the future).
- Invoice generation is on-demand (no automatic generation).
- Email and approval routing send **only** from Ovation Microsoft mailboxes (no external mail vendors).
- Real client data is treated as confidential and never leaves Ovation systems.


---

# Part 2 — Architecture

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
