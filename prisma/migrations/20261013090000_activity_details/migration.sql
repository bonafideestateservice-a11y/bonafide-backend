-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'PROPERTY_ADDED';

-- AlterTable
ALTER TABLE "ActivityLog" ADD COLUMN     "agentName" TEXT,
ADD COLUMN     "amount" INTEGER,
ADD COLUMN     "clientName" TEXT,
ADD COLUMN     "propertyId" TEXT;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

