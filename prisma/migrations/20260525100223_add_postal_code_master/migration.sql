-- CreateTable
CREATE TABLE "postal_codes" (
    "id" TEXT NOT NULL,
    "zipcode" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "postal_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "postal_codes_zipcode_key" ON "postal_codes"("zipcode");

-- AlterTable
ALTER TABLE "technicians" ADD COLUMN "postalCodeId" TEXT;

-- CreateIndex
CREATE INDEX "technicians_postalCodeId_idx" ON "technicians"("postalCodeId");

-- AddForeignKey
ALTER TABLE "technicians" ADD CONSTRAINT "technicians_postalCodeId_fkey" FOREIGN KEY ("postalCodeId") REFERENCES "postal_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
