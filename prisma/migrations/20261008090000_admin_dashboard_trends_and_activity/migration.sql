-- AlterTable
ALTER TABLE "VerificationAgent" ADD COLUMN     "deactivatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Property" ADD COLUMN     "verifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "assignedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "verificationRequestId" TEXT,
    "subjectName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActivityLog_createdAt_idx" ON "ActivityLog"("createdAt");

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_verificationRequestId_fkey" FOREIGN KEY ("verificationRequestId") REFERENCES "VerificationRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill. updatedAt is the best available guess for when a status last changed.
UPDATE "Property" SET "verifiedAt" = "updatedAt" WHERE "status" = 'VERIFIED' AND "verifiedAt" IS NULL;
UPDATE "VerificationAgent" SET "deactivatedAt" = "updatedAt" WHERE "status" = 'INACTIVE' AND "deactivatedAt" IS NULL;

-- A paid period was assigned when its current assignment was created, or at the latest
-- when its report was written.
UPDATE "Transaction" t SET "assignedAt" = a."createdAt"
FROM "AgentAssignment" a WHERE a."transactionId" = t.id AND t."assignedAt" IS NULL;
UPDATE "Transaction" t SET "assignedAt" = r."createdAt"
FROM "VerificationReport" r WHERE r."transactionId" = t.id AND t."assignedAt" IS NULL;
