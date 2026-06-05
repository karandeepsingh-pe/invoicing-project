# Ovation Invoicing — Tester Use-Case Scenarios

A practical, end-to-end test script for the invoicing app. Work top to bottom: the
later scenarios assume the masters + an account from the Setup section.

- **URL:** https://invoicing-project-three.vercel.app (enter the shared username + password when prompted).
- **No in-app login yet** — everyone is the shared admin. The password gate is the only lock.
- **Currency:** USD. **Default Hours:** the account's "Default Hours" (usually 8) defines a full day.
- Mark each scenario Pass/Fail and note the actual vs expected number.

How billing is structured (quick mental model):
- **Account** holds the **rate card** (per Band 0–4, per sub-category, and per **Backfill / No-Backfill tier**).
- A **Technician** has a Band, a primary category, a Backfill tier, and (for Dedicated) a **Billing basis** (Day rate vs Hourly).
- The **timesheet / dispatch visits** supply the quantity (days / hours / visits). The **pre-invoice** = quantity × the resolved rate.

---

## 0. Setup (do once)

1. **Masters present** — Masters menu shows SLAs, Sub-categories, Visit Types, Holidays (seeded). If empty, stop and report.
2. **Create an Org** (Partner Management → Add Org), e.g. "TestCorp", currency USD.
3. **Create an Account** under it (e.g. "Acme"), set **Default Hours = 8**. Optionally set a **Dispatch business-hours window** 09:00–17:00 and **Dispatch pricing model = Standard**.
4. **Fill the rate card** (Account → Manage rates). The matrix has one section per category; cells are per Band, autosave on blur. Use the **Tier toggle** (No Backfill / Backfill) — rates entered per tier.

✅ Expect: account appears in the list; rate cells save ("All changes saved").

---

## 1. Dedicated — Day-rate basis

Rate card (Dedicated, **Band 2**, **No Backfill** tier): set **Annual Rate = 78,000** (leave Day/Monthly/Hourly blank), **OT Hourly Rate = 75**, **Weekend Hourly Rate = 100**.

1.1 **Create a Dedicated tech** (Add Technician): Band 2, Primary category = Dedicated, **Backfill tier = No Backfill**, **Billing basis = Day rate**. Assign to Acme (from the account page → Add assignment, category Dedicated).

1.2 **Full month** — Timesheets → Acme → Dedicated tab → fill every weekday with 8. Generate combined.
- ✅ Expect: a fully-worked month bills **Annual ÷ 12 = 6,500** for that tech (day rate = 78,000 ÷ 12 ÷ businessDays, × days = annual ÷ 12).

1.3 **Overtime** — set one weekday to 10 (8 + 2 OT).
- ✅ Expect: extended = (days × day rate) **+ 2 × 75**.

1.4 **Weekend** — add 5 hours on a Saturday.
- ✅ Expect: **+ 5 × 100** weekend.

1.5 **Backfill tier** — switch the tech's Backfill tier to Backfill; fill the **Backfill** tier rates on the card (different numbers). Regenerate.
- ✅ Expect: it now bills off the Backfill-tier rates, not No-Backfill.

1.6 **Day / Monthly basis** — instead of Annual, fill only **Day Rate = 300** (clear Annual). 22 worked days.
- ✅ Expect: **300 × 22 = 6,600** (Day rate is flat per day, not month-scaled). Monthly basis = Monthly ÷ businessDays per day.

> Note: fill **one** day-rate basis (Annual *or* Day *or* Monthly). Priority if several: Day > Annual > Monthly.

---

## 2. Dedicated — Hourly basis (per technician)

Rate card (Dedicated, Band 2, No Backfill): set **Hourly Rate = 30** (plus OT 75, Weekend 100 as above).

2.1 **Create a second Dedicated tech**, Band 2, **Billing basis = Hourly**, assign to Acme. (You now have a day-rate tech and an hourly tech on the **same** account/band — that's the point of per-tech basis.)

2.2 Timesheet: 3 weekdays = 8, 8, 10.
- ✅ Expect: regular **24 h × 30 = 720** + **2 OT × 75 = 150** → **870**. Pre-invoice remark shows "Hourly basis: 24.00h @ $30/hr".
- ✅ The day-rate tech on the same account still bills by day (unaffected).

---

## 3. Rebadged technician

3.1 Create a Dedicated tech, tick **Rebadged**, enter the rebadged rates (e.g. Annual 208,000, or Day/Monthly/Hourly + OT + Weekend). Assign to Acme.
- ✅ Expect: bills off the **technician's own** rebadged rates, **ignoring** the account rate card. Day rate priority: Day > Monthly > Annual > Hourly×DefaultHours. Band shows "Rebadged".

---

## 4. Project / T&M

Rate card (Project/T&M, Band 2): Full Day = 420, Half Day = 260, Weekly/Monthly as desired.

4.1 Create a Project tech (Band 2), assign Project to Acme (assignments need a start + **end** date).
4.2 Timesheet (Project/T&M tab): 15 full days.
- ✅ Expect: **15 × 420 = 6,300**. A half day (4h) bills the **Half Day** rate, not half of Full Day.

---

## 5. Scheduled Visit

Rate card (Scheduled, Band 2): Full Day = 410, Half Day = 260.

5.1 Create a Scheduled tech, assign Scheduled to Acme. Timesheet: 9 full days.
- ✅ Expect: **9 × 410 = 3,690**. A partial (null-status) day bills the Half Day rate.

---

## 6. Dispatch (per-visit)

Account: ensure **business-hours window = 09:00–17:00**. Rate card (Dispatch, Band 2, SLA e.g. NBD):
First Hour = 100, Additional Hour = 70, First Hour OOB = 130, Additional Hour OOB = 90,
First Hour Weekend = 160, Additional Hour Weekend = 110.

6.1 Create a Dispatch tech, add a **Dispatch assignment** to Acme. Go to Timesheets → Dispatch tab (or Dispatch Visits page).
6.2 **Weekday split** — log a visit In **15:00** / Out **19:00** (Total Hrs auto-fills to 4).
- ✅ Expect billed **350** = 1st hr 100 + 1 h business (×70) + 2 h after-5 OOB (×90). Live preview shows it before saving.
6.3 **All after-hours** — visit In **20:00** / Out **23:00**.
- ✅ Expect **3 h all OOB**: 130 + 2×90 = 310.
6.4 **Weekend** — visit on a Saturday, 4 h.
- ✅ Expect the whole visit at weekend rates: 160 + 3×110 = 490.
6.5 **Manual OOO (no In/Out)** — clear In/Out, Total Hrs 4, OOO Hrs 2.
- ✅ Expect 100 + 1×70 + 2×90 = 350.
6.6 **Per-ticket flat** — on a fresh account/SLA fill only "Per Ticket Business (Flat)" = 250.
- ✅ Expect every business visit bills flat 250 regardless of hours.
6.7 **Edit a visit** — click **Edit** on a logged visit, change hours/SLA/times, save.
- ✅ Expect the billed amount recomputes; the booking updates.
6.8 **Delete a visit** — Delete; row disappears, total drops.
6.9 **Unpriced SLA** — pick an SLA with no rate.
- ✅ Expect inline "no rate → $0" warning before saving; the dropdown lists priced SLAs first.

---

## 7. Misc fees

7.1 Account → Misc fees → add a **percentage** fee (e.g. Project Management 3%) and a **flat** fee (e.g. Retainer 500).
- ✅ Expect on the invoice: 3% applied to the line-item subtotal, then flat fees added. Grand = subtotal + fees.

---

## 8. Invoice generation (the payoff)

8.1 Invoices → Generate **combined** for Acme + month → an **.xlsx downloads**.
- ✅ Expect the file's line items + totals match what the timesheet/dispatch grids showed.
8.2 Generate **dispatch-only** and (for an HCL-org account) the **FSO** workbook.
- ✅ Expect each downloads and opens cleanly in Excel.

---

## 9. Edge / negative cases

- 9.1 **Empty rate cell** → that line bills **$0**; Dedicated shows it as "unpriced" (flagged, not silently $0); Dispatch shows the inline warning.
- 9.2 **Invalid timesheet cell** (e.g. "abc" or 30) → red ring, not saved.
- 9.3 **Soft-delete + restore** a timesheet cell / dispatch visit (testing-phase affordance) → removes then restores.
- 9.4 **Two band-2 Dedicated techs, one Day-rate + one Hourly**, same account → each bills by its own basis.
- 9.5 **Mid-month / partial month** Dedicated → bills only worked days (PH counts as a paid day; AB/NA/PTO = 0).

---

## Notes for testers
- Dedicated grid **autosaves** and pre-fills weekdays to 8 — **edit non-worked days down** (delete or set 0/NA) or they inflate the bill.
- "OT" = hours past the designated day (Dedicated). "OOB" = after business hours (Dispatch, from In/Out). They're different.
- Fill the rate card per **Band** and per **Tier** (No-Backfill vs Backfill) for the techs you test.
- Report: scenario #, what you did, expected vs actual number, screenshot if it differs.
