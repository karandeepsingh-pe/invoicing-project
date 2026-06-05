# Ovation Invoicing — User Manual

A plain-English guide to using the app: from signing in, through setting up clients and
technicians, entering work, and generating an invoice. Read it start to finish the first
time; after that, use the table of contents to jump to what you need.

## Contents
1. [What this app does](#1-what-this-app-does)
2. [Signing in](#2-signing-in)
3. [The big picture (key terms)](#3-the-big-picture-key-terms)
4. [Step 1 — Create an Org (the client company)](#4-step-1--create-an-org)
5. [Step 2 — Create an Account](#5-step-2--create-an-account)
6. [Step 3 — Build the rate card](#6-step-3--build-the-rate-card)
7. [Step 4 — Add technicians](#7-step-4--add-technicians)
8. [Step 5 — Assign technicians to an account](#8-step-5--assign-technicians-to-an-account)
9. [Step 6 — Enter timesheets (Dedicated / Project / Scheduled)](#9-step-6--enter-timesheets)
10. [Step 7 — Log dispatch visits](#10-step-7--log-dispatch-visits)
11. [Step 8 — Misc fees](#11-step-8--misc-fees)
12. [Step 9 — Generate the invoice](#12-step-9--generate-the-invoice)
13. [How billing is calculated](#13-how-billing-is-calculated)
14. [Tips & common mistakes](#14-tips--common-mistakes)
15. [Glossary](#15-glossary)
16. [Troubleshooting / FAQ](#16-troubleshooting--faq)

---

## 1. What this app does

It turns technician work (timesheets and dispatch visits) into a client invoice — automatically,
using each client's agreed rates. You set up the client, its rate card, and its technicians once;
then each month you enter the work and click **Generate** to download a ready-to-send Excel invoice.

It replaces the old manual spreadsheets, so the numbers are consistent and you don't re-key rates.

---

## 2. Signing in

Open the app URL. A browser pop-up asks for a **username and password** — enter the shared
credentials your admin gave you. (There's no personal login yet; everyone shares the admin access,
so only people with the password can get in.)

Once in, you'll see the left sidebar: **Dashboard · Partner Management · Timesheets · Invoices · Masters**.

---

## 3. The big picture (key terms)

| Term | What it is |
|------|-----------|
| **Org** | The client *company* (e.g. Cognizant, TCS, HCL). |
| **Account** | A billing relationship under an Org (e.g. "Acme" under Cognizant). Most work happens per account. |
| **Technician** | A field engineer. Has a **Band** (0–4, seniority) and a primary category. |
| **Rate card** | The account's price list — a grid of rates per Band, per work type. |
| **Assignment** | Links a technician to an account under one category (Dedicated / Project / Scheduled / Dispatch). |
| **Timesheet** | Daily hours per technician (for Dedicated / Project / Scheduled work). |
| **Dispatch visit** | A single on-site job with In/Out times, an SLA, and a ticket. |
| **Category** | The four ways work is billed: **Dedicated** (full-time), **Project / T&M**, **Scheduled**, **Dispatch**. |
| **Band** | Technician seniority 0–4. Rates are set per band. |
| **Tier** | For Dedicated only: **No Backfill** vs **Backfill** — two rate columns; pick the one matching the tech. |

The flow is always: **set up the rate card → assign technicians → enter their work → generate the invoice.**

---

## 4. Step 1 — Create an Org

1. Go to **Partner Management**.
2. Click **Add Org**. Enter the company name and default currency (USD).
3. (HCL only) Orgs marked as FSO output get the special FSO workbook on top of the normal pre-invoice.

You can also bulk-create accounts/technicians via the **Upload** buttons (Excel) on Partner Management.

---

## 5. Step 2 — Create an Account

1. **Partner Management → Add Account** (or the **+** on the Accounts page).
2. Fill in:
   - **Org** (parent company) and **Account name**.
   - **Currency** (blank = inherit the Org default).
   - **Default Hours** — what counts as a full working day (usually **8**). This drives the day↔hour math and overtime.
   - **Client POC / SPOC email, address** — shown on the invoice (optional).
   - **Dispatch pricing model** — *Standard* for most; *TCS priority* only for TCS-style priority billing.
   - **Business hours** (e.g. **09:00–17:00**) — used by Dispatch to split a visit into business vs after-hours. Leave blank to bill dispatch by the manual after-hours flag instead.
3. Save. The account now appears in the list and has its own page.

---

## 6. Step 3 — Build the rate card

Open the account → **Manage rates**. You'll see one section per category. Each is a grid:
rows = rate types, columns = **Band 0–4**. Type a number in a cell; it **saves automatically**
("All changes saved"). Blank = no rate (won't bill).

**Dedicated** (full-time techs) — note the **Tier toggle** at the top (No Backfill / Backfill); fill
rates for each tier you use:
- **Annual / Day / Monthly Rate** — the *day-rate basis*. **Fill only one** (priority: Day > Annual > Monthly).
  - Annual: a fully-worked month bills exactly Annual ÷ 12.
  - Day: a flat amount per day worked.
  - Monthly: that amount spread over the month's working days.
- **Hourly Rate** — only used if a technician is set to the **Hourly** basis (see §7). Billed per regular hour.
- **OT Hourly Rate** (blue) — overtime, for hours beyond the Default Hours in a day.
- **Weekend Hourly Rate** (blue) — for hours worked on weekends.

**Project / T&M** — Full Day, Half Day, Weekend variants, Hourly, Weekly, Monthly (per band).

**Scheduled Visit** — Full Day, Half Day, Weekend (per band).

**Dispatch** — per **SLA** (response time) columns:
- **First Hour** / **Additional Hour** (Business), and the **Out-of-Business** and **Weekend** versions.
- **Per Ticket (Flat)** options, **Half/Full Day** caps.
- Tip: an account bills dispatch **either** hourly (First+Additional) **or** a flat Per-Ticket — not both.

> You only fill the rows/bands/tiers you actually use. Empty cells simply don't bill.

---

## 7. Step 4 — Add technicians

**Partner Management → Add Technician** (or bulk-upload). Enter:
- **Name, Employee ID** (optional, unique per Org), **phone/email** (shown on dispatch tracker).
- **Employer Org** and **Band** (0–4).
- **Primary category** — Dedicated / Project / Dispatch / Scheduled.
- For **Dedicated** techs you'll also see:
  - **Backfill tier** — Backfill or No Backfill (must match how they're priced).
  - **Billing basis** — **Day rate** (most techs) or **Hourly** (billed per regular hour). This is per-technician,
    so one band-2 tech can be day-rate and another band-2 tech hourly on the *same* account.
  - **Rebadged** — tick if the tech bills off their **own** salary/rates instead of the account card; then enter
    their annual / day / monthly / hourly / OT / weekend rates.
- **Location** — enter a zipcode to auto-fill city/state (used on the dispatch tracker).

---

## 8. Step 5 — Assign technicians to an account

From the **account page → Add assignment** (or create the tech from the account page to auto-assign):
- Pick the technician, the **category**, and the **start date** (Dedicated is open-ended; Project/Scheduled/Dispatch need an **end date**).
- The assignment inherits rates from the account card at the tech's band/tier.

A technician only shows up on a timesheet/dispatch tab once they have an assignment of that category overlapping the month.

---

## 9. Step 6 — Enter timesheets

**Timesheets → pick the account → choose the tab** (Dedicated FTE / Project / Scheduled). Pick the month → **Load**.

You get a grid: one row per technician, one column per day.
- Type the **hours** in a cell (e.g. `8`). It **autosaves** when you click away — there's no Save button.
- For non-worked days use a **status**: `PH` (paid holiday), `AB` (absent), `NA` (not applicable), `PTO`, `HALF_DAY`.
- **Dedicated** weekdays pre-fill to the account's Default Hours (e.g. 8). **Change non-worked days down** (set 0 or a status) or they'll bill — this is the most common mistake.
- More than Default Hours in a day → the extra counts as **overtime**. Weekend dates → **weekend** hours.
- "Fill range" lets you set many days at once; "Delete month" clears a tech's month.

What bills:
- **Dedicated** = day rate × days worked (+ OT hours + weekend hours), *or* hourly × regular hours if the tech is on the Hourly basis.
- **Project / Scheduled** = day/half-day/hourly rate × what you entered.

---

## 10. Step 7 — Log dispatch visits

**Timesheets → account → Dispatch tab** (or the Dispatch Visits page). You need a Dispatch **assignment** first.

Click **Add visit** and fill:
- **Engineer**, **Ticket**, **Work status** (Completed bills; Cancelled/No-show usually don't).
- **Visit date**, **In-Time / Out-Time** — **Total Hours auto-fills** from these.
- **SLA** — the dropdown shows the account's priced dispatch SLAs first.
- **OOO Hrs** — only if you didn't enter In/Out times (manual after-hours hours).
- **After-hours / Weekend** checkboxes — usually auto-handled when In/Out + business hours are set.

A **live preview** shows the charge as you type, and warns if the SLA has no rate (would bill $0).

How a visit bills (with business hours 09:00–17:00):
- First hour at the **First Hour** rate; each additional hour at the **Additional Hour** rate.
- Hours **after 17:00** bill at the **Out-of-Business** rates; a **weekend date** bills the whole visit at **Weekend** rates.
- Example: In 15:00 / Out 19:00 → 1st hr + 1 business hour + 2 after-hours hours.

You can **Edit** or **Delete** any logged visit (Edit reopens the form pre-filled; the charge recomputes).

---

## 11. Step 8 — Misc fees

On the account page → **Misc fees → Add**:
- A **percentage** fee (e.g. Project Management 3%) is applied to the invoice's line-item subtotal.
- A **flat** fee (e.g. Retainer, reimbursements) is added on top.

---

## 12. Step 9 — Generate the invoice

**Invoices** (or the Generate links on the account/timesheet page) → pick the account + month:
- **Generate combined** — one pre-invoice with all categories (Dedicated + Project + Scheduled + Dispatch) + fees.
- **Generate dispatch** — dispatch-only.
- HCL accounts also get the **FSO** workbook.

An **Excel file downloads**. Open it — the line items and totals match what you saw in the grids. Each generation is logged under the account's **Invoice runs**.

---

## 13. How billing is calculated

| Category | What drives it | Formula (per technician) |
|---|---|---|
| **Dedicated (Day rate)** | timesheet days | day rate × days worked + OT hours × OT rate + weekend hours × weekend rate |
| **Dedicated (Hourly)** | timesheet hours | regular hours × Hourly rate + OT × OT rate + weekend × weekend rate |
| **Project / T&M** | timesheet days/hours | day / half-day / hourly / weekly / monthly rate × quantity (with optional monthly cap) |
| **Scheduled** | timesheet days | Full Day / Half Day rate × days |
| **Dispatch** | visits | First Hour + (extra hours × Additional), split business / after-hours / weekend; or a flat Per-Ticket |
| **Rebadged tech** | own rates | bills off the technician's own salary/rates, ignoring the account card |
| **Misc fees** | invoice subtotal | % fee on subtotal + flat fees |

**OT vs OOB** (don't confuse them):
- **OT (overtime)** = working *more than the standard day* (Dedicated). Comes from total daily hours.
- **OOB (out-of-business)** = working *outside business hours, e.g. after 5pm* (Dispatch). Comes from In/Out times.

**Backfill tier** — Dedicated rates differ for backfilled vs non-backfilled engagements; the tech's tier picks the column.

---

## 14. Tips & common mistakes

- **Dedicated pre-fill inflates the bill if you don't trim it.** Weekdays default to 8 hours; set non-worked days to 0 or a status.
- **Fill one day-rate basis per band/tier** (Annual *or* Day *or* Monthly). Filling several is confusing (priority Day > Annual > Monthly).
- **Empty rate cell = $0.** If a line bills $0, the rate is missing — fill the right band/tier/SLA cell.
- **A tech must be assigned** to an account (right category, overlapping the month) before they appear on its timesheet/dispatch tab.
- **Dispatch: pick the In/Out times** — the split and total hours come from them. Use OOO Hrs only when you can't give exact times.
- **One dispatch pricing mode per account** — hourly *or* per-ticket flat, not both.

---

## 15. Glossary

- **Band** — technician seniority 0–4; rates are per band.
- **Tier** — Dedicated only: Backfill vs No Backfill rate columns.
- **Basis** — Dedicated only: Day-rate vs Hourly (set on the technician).
- **SLA** — dispatch response level (e.g. NBD = next business day) that keys the dispatch rate.
- **PH / AB / NA / PTO / Half Day** — timesheet day statuses. PH bills as a paid day; AB/NA/PTO = 0; Half Day = half.
- **Pre-invoice** — the generated Excel for internal/client review before final billing.
- **Rebadged** — a Dedicated tech billed off their own salary, not the account card.

---

## 16. Troubleshooting / FAQ

**A line bills $0 / shows "unpriced".** The rate cell is empty for that band/tier/SLA — fill it on the rate card.

**A technician doesn't appear on the timesheet.** They need an **assignment** of that category overlapping the month. Add it from the account page.

**The Dedicated total looks too high.** Non-worked weekdays were left pre-filled at 8. Set them to 0 or a status (AB/NA/PTO).

**Dispatch charge looks wrong.** Check the In/Out times, the account's business-hours window, and that the SLA has rates filled. Watch the live preview while entering.

**Two band-2 Dedicated techs bill differently.** That's expected if one is Day-rate and the other Hourly (the basis is per-technician).

**The Dispatch tab says "0 engineers".** No technician has a Dispatch assignment on that account yet.

**Can I undo a delete?** Timesheet cells and dispatch visits use soft-delete during testing — they can be restored. Ask your admin.

**Where do generated invoices go?** They download to your computer as Excel files; a record is kept under the account's Invoice runs.

---

*Need a feature or hit a bug? Note the account, month, and what you expected vs saw, and send it to your admin.*
