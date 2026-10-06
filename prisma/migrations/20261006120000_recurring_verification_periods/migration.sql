-- AlterEnum
ALTER TYPE "VerificationStatus" ADD VALUE 'AWAITING_RENEWAL';

-- DropForeignKey
ALTER TABLE "VerificationChecklistItem" DROP CONSTRAINT "VerificationChecklistItem_agentAssignmentId_fkey";

-- DropIndex
DROP INDEX "VerificationReport_verificationRequestId_key";

-- AlterTable
ALTER TABLE "AgentAssignment" ADD COLUMN     "transactionId" TEXT;

-- AlterTable
ALTER TABLE "VerificationChecklistItem" ADD COLUMN     "reportId" TEXT,
ALTER COLUMN "agentAssignmentId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "VerificationReport" ADD COLUMN     "additionalNotes" TEXT,
ADD COLUMN     "transactionId" TEXT;

-- CreateIndex
CREATE INDEX "AgentAssignment_transactionId_idx" ON "AgentAssignment"("transactionId");

-- CreateIndex
CREATE INDEX "VerificationChecklistItem_reportId_idx" ON "VerificationChecklistItem"("reportId");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationReport_transactionId_key" ON "VerificationReport"("transactionId");

-- CreateIndex
CREATE INDEX "VerificationReport_verificationRequestId_generatedAt_idx" ON "VerificationReport"("verificationRequestId", "generatedAt");

-- AddForeignKey
ALTER TABLE "AgentAssignment" ADD CONSTRAINT "AgentAssignment_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationChecklistItem" ADD CONSTRAINT "VerificationChecklistItem_agentAssignmentId_fkey" FOREIGN KEY ("agentAssignmentId") REFERENCES "AgentAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationChecklistItem" ADD CONSTRAINT "VerificationChecklistItem_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "VerificationReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationReport" ADD CONSTRAINT "VerificationReport_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

