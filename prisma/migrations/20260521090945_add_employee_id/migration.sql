-- AlterTable
ALTER TABLE "technicians" ADD COLUMN "employeeId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "technicians_employerOrgId_employeeId_key" ON "technicians"("employerOrgId", "employeeId");
