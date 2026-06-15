-- Remittance bill-to entity fields on Org. All nullable / additive — safe,
-- non-destructive. Shown under "Client Details:" on the Remittance Advice sheet
-- for every account under the org.
ALTER TABLE "orgs" ADD COLUMN "remitClientCode" TEXT;
ALTER TABLE "orgs" ADD COLUMN "remitClientName" TEXT;
ALTER TABLE "orgs" ADD COLUMN "remitClientAddress" TEXT;
