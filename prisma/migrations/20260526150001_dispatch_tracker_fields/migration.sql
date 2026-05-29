-- Full dispatch tracker fields (client spec) + work-status enum + PostalCode FK
-- for City/State/Zip (zip auto-fill). All additive/nullable; workStatus defaults
-- COMPLETED so existing rows stay billable.

-- CreateEnum
CREATE TYPE "DispatchWorkStatus" AS ENUM ('COMPLETED', 'CANCELLED', 'RESCHEDULED', 'NO_SHOW', 'PENDING');

-- AlterTable
ALTER TABLE "dispatch_visits" ADD COLUMN     "requestReceivedDate" DATE,
ADD COLUMN     "proposedOnsiteDate" DATE,
ADD COLUMN     "visitTime" TEXT,
ADD COLUMN     "siteCode" TEXT,
ADD COLUMN     "workStatus" "DispatchWorkStatus" NOT NULL DEFAULT 'COMPLETED',
ADD COLUMN     "oooHrs" DECIMAL(6,2),
ADD COLUMN     "postalCodeId" TEXT;

-- CreateIndex
CREATE INDEX "dispatch_visits_postalCodeId_idx" ON "dispatch_visits"("postalCodeId");

-- AddForeignKey
ALTER TABLE "dispatch_visits" ADD CONSTRAINT "dispatch_visits_postalCodeId_fkey" FOREIGN KEY ("postalCodeId") REFERENCES "postal_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
