-- Drop the rate-basis policy: dedicated billing is hourly only. Annual figures
-- are now a data-entry convenience (stored as the hourly rate). First convert
-- any existing DEDICATED "Annual Rate" rows to the Hourly Rate at annual / 2080.

-- Where an Hourly Rate already exists for the same account/band/SLA window, the
-- explicit hourly wins: drop the annual row.
DELETE FROM "account_rates" ar
USING "rate_sub_categories" annual
WHERE ar."rateSubCategoryId" = annual."id"
  AND annual."rateCategory" = 'DEDICATED' AND annual."code" = 'ANNUAL_RATE'
  AND EXISTS (
    SELECT 1
    FROM "account_rates" h
    JOIN "rate_sub_categories" hourly ON h."rateSubCategoryId" = hourly."id"
    WHERE hourly."rateCategory" = 'DEDICATED' AND hourly."code" = 'MONTHLY_DAY_RATE'
      AND h."clientAccountId" = ar."clientAccountId"
      AND h."band" = ar."band"
      AND h."slaId" = ar."slaId"
      AND h."effectiveFrom" = ar."effectiveFrom"
  );

-- Re-point remaining annual rows to the Hourly Rate, dividing the amount by 2080.
UPDATE "account_rates" ar
SET "rateSubCategoryId" = hourly."id",
    "rateAmount" = CASE
      WHEN ar."rateAmount" IS NULL THEN NULL
      ELSE ROUND(ar."rateAmount" / 2080.0, 4)
    END
FROM "rate_sub_categories" annual, "rate_sub_categories" hourly
WHERE ar."rateSubCategoryId" = annual."id"
  AND annual."rateCategory" = 'DEDICATED' AND annual."code" = 'ANNUAL_RATE'
  AND hourly."rateCategory" = 'DEDICATED' AND hourly."code" = 'MONTHLY_DAY_RATE';

-- Drop the rate-basis columns and enum.
ALTER TABLE "client_accounts" DROP COLUMN "rateBasisOverride";
ALTER TABLE "orgs" DROP COLUMN "rateBasis";
DROP TYPE "RateBasis";
