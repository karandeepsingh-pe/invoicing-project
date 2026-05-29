-- Phase 3: shared booking calendar + richer dispatch.
--   * dispatch_visit_types master
--   * richer dispatch_visits columns (location / visit type / clock times / travel / parts)
--   * technician_bookings (shared PROJECT+DISPATCH scheduling calendar for overlap checks)

-- CreateEnum
CREATE TYPE "BookingKind" AS ENUM ('PROJECT', 'DISPATCH');

-- CreateTable
CREATE TABLE "dispatch_visit_types" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "dispatch_visit_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dispatch_visit_types_code_key" ON "dispatch_visit_types"("code");

-- AlterTable: richer dispatch visit columns
ALTER TABLE "dispatch_visits" ADD COLUMN     "siteLocation" TEXT,
ADD COLUMN     "visitTypeId" TEXT,
ADD COLUMN     "startDateTime" TIMESTAMPTZ(6),
ADD COLUMN     "endDateTime" TIMESTAMPTZ(6),
ADD COLUMN     "travelHours" DECIMAL(6,2),
ADD COLUMN     "travelMiles" DECIMAL(8,2),
ADD COLUMN     "partsAmount" DECIMAL(12,2),
ADD COLUMN     "reimbursementNotes" TEXT;

-- AddForeignKey
ALTER TABLE "dispatch_visits" ADD CONSTRAINT "dispatch_visits_visitTypeId_fkey" FOREIGN KEY ("visitTypeId") REFERENCES "dispatch_visit_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "technician_bookings" (
    "id" TEXT NOT NULL,
    "technicianId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "kind" "BookingKind" NOT NULL,
    "startDateTime" TIMESTAMPTZ(6) NOT NULL,
    "endDateTime" TIMESTAMPTZ(6) NOT NULL,
    "dispatchVisitId" TEXT,
    "timesheetEntryId" TEXT,
    "isOverride" BOOLEAN NOT NULL DEFAULT false,
    "overrideReason" TEXT,
    "enteredById" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "technician_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "technician_bookings_dispatchVisitId_key" ON "technician_bookings"("dispatchVisitId");

-- CreateIndex
CREATE UNIQUE INDEX "technician_bookings_timesheetEntryId_key" ON "technician_bookings"("timesheetEntryId");

-- CreateIndex
CREATE INDEX "technician_bookings_technicianId_startDateTime_endDateTime_idx" ON "technician_bookings"("technicianId", "startDateTime", "endDateTime");
