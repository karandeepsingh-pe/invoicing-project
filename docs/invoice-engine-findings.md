# Pre-Invoice engine: findings

Investigation of the existing billing/invoice code, written before changing any money math.
Plain language, no em dashes.

## Stack and structure

- Next.js 15 (App Router, TypeScript), Prisma + Postgres, ExcelJS for xlsx export.
- Admin UI under `src/app/admin/*`. Server actions under `src/lib/actions/*`. Pure domain/calc
  logic under `src/lib/invoice/*` and `src/lib/domain/*`. Zod schemas under `src/lib/schemas/*`.
- Money math is already pure and side-effect-free in `src/lib/invoice/*`, unit-tested under
  `tests/unit/*`. No language model is on the calculation path. The hard constraint already holds.

## Where the data lives

- Org -> ClientAccount -> Technician hierarchy in `prisma/schema.prisma`.
- Rate card: `AccountRate` rows, keyed by (clientAccountId, rateSubCategoryId, band, slaId,
  effectiveFrom..effectiveTo). `rateAmount` is nullable so commercials can fill later.
  - `RateSubCategory` (master) defines the line types per `RateCategory`
    (DEDICATED / PROJECT_TM / DISPATCH_SCHED).
  - With-backfill vs without-backfill is the `AssignmentSlaTier` (BACKFILL / NO_BACKFILL / NONE),
    matched against `AccountRate.sla.code`.
- Per-account add-ons: `MiscFee` rows (kind + flat `amount`). Retainer = sum(kind=RETAINER_FEES);
  reimbursements = sum(all other kinds). There is no percentage fee today.
- Timesheets: `TimesheetEntry` (assignmentId, date, hours, status). Status enum `PH/AB/NA`.
- Invoice runs: `InvoiceRun` (account, period, format, generatedBy). Audit metadata, no stored file.

## Existing invoice logic

- Calculators (pure): `dedicated-fte-calculator.ts`, `project-calculator.ts`, `dispatch-calculator.ts`,
  `coverage.ts`, `hours-split.ts`, `period.ts`, `billing-basis.ts`, `rebadged-rates.ts`.
- Rate resolution: `account-rate-resolver.ts` (+ `rate-resolver.ts`).
- Row loaders + generators: `fte-rows.ts`, `project-rows.ts`, `dispatch-rows.ts`, and
  `src/lib/actions/generate-pre-invoice.ts` (+ dispatch/project/combined).
- Renderers: `render-pre-invoice.ts` produces the target columns exactly (Location, Technician, Band,
  BAND SLA, Engineer Type, Business Days, Days Worked, Day Rate, OT Hours, OT Rate, Weekend Hour,
  Weekend Rate, Extended Total, Remarks) plus TOTAL, Retainer, Reimbursements, grand TOTAL.
- Editable timesheet grid: `src/app/admin/timesheets/[accountId]/timesheet-grid.tsx`
  (technicians x days; per-cell hours or status; live Days/OT/Weekend recompute).

## Technician identity (important)

Matching is by STABLE ID, not name/location. `TimesheetEntry.assignmentId -> Assignment.technicianId
-> Technician.id`. There is no Excel import path anywhere (searched: no xlsx parse / upload / import).
So the "Hendrixson vs Hendrickson" mis-pricing risk does not exist in-app. Timesheets are entered in
the grid only. The analogous safety net we will add is a "needs review / unpriced" list: any assignment
with no resolvable active rate row is surfaced rather than billed at 0.

## Per-account differences

Represented as data: `MiscFee` rows per account (flat amounts today) and the per-account `AccountRate`
matrix. The renderer is one-size-fits-all (PRE_INVOICE). `Org.outputTemplate` has an FSO value but no
FSO renderer exists; FSO is unimplemented.

## The bug this work fixes

The dedicated/FTE Extended Total is wrong against real invoices.

- Current code: `dayRate x daysWorked + OT + weekend`, where the ANNUAL basis uses `dayRate = annual / 260`.
  Business Days is computed (weekdays minus public holidays) and displayed, but NOT used in the math.
- Correct rule (confirmed against real invoices): `Extended = (Annual / 12) x (Days Worked / Business Days)`,
  then + OT + weekend. Examples:
  - annual 74,100, with-backfill, 21/21 worked -> 6,175.00 (current code gives 5,985, wrong).
  - annual 83,000, without-backfill, 6/21 worked -> 1,976.19 (current code gives ~1,915, wrong).
- Business Days must become a per-run input used in the FTE day-rate derivation.

## Other gaps to close

- No percentage add-on (e.g. JLL 3% PM fee). `MiscFee` is flat-only.
- No half-day or PTO attendance state (only PH/AB/NA, all = 0 days).
- Dispatch bills first-hour + additional-hour only; no flat per-ticket option.
