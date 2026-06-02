-- AlterTable
ALTER TABLE "client_accounts" ADD COLUMN     "addressLine1" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "postalCode" TEXT,
ADD COLUMN     "state" TEXT;

-- AlterTable
ALTER TABLE "technicians" ADD COLUMN     "addressLine1" TEXT;
