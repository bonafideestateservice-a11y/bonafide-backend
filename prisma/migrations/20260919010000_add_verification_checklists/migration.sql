-- CreateEnum
CREATE TYPE "ChecklistItemStatus" AS ENUM ('PENDING', 'COMPLETE');

-- CreateTable
CREATE TABLE "ChecklistTemplateItem" (
    "id" TEXT NOT NULL,
    "verificationTypeId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "requiresMedia" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "ChecklistTemplateItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationChecklistItem" (
    "id" TEXT NOT NULL,
    "agentAssignmentId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "status" "ChecklistItemStatus" NOT NULL DEFAULT 'PENDING',
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificationChecklistItem_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "AgentAssignment" ADD COLUMN "additionalNotes" TEXT;
ALTER TABLE "Document" ADD COLUMN "checklistItemId" TEXT;

-- CreateIndex
CREATE INDEX "ChecklistTemplateItem_verificationTypeId_idx" ON "ChecklistTemplateItem"("verificationTypeId");
CREATE UNIQUE INDEX "ChecklistTemplateItem_verificationTypeId_sortOrder_key" ON "ChecklistTemplateItem"("verificationTypeId", "sortOrder");
CREATE INDEX "VerificationChecklistItem_agentAssignmentId_idx" ON "VerificationChecklistItem"("agentAssignmentId");
CREATE INDEX "Document_checklistItemId_idx" ON "Document"("checklistItemId");

-- AddForeignKey
ALTER TABLE "ChecklistTemplateItem" ADD CONSTRAINT "ChecklistTemplateItem_verificationTypeId_fkey" FOREIGN KEY ("verificationTypeId") REFERENCES "VerificationType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VerificationChecklistItem" ADD CONSTRAINT "VerificationChecklistItem_agentAssignmentId_fkey" FOREIGN KEY ("agentAssignmentId") REFERENCES "AgentAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_checklistItemId_fkey" FOREIGN KEY ("checklistItemId") REFERENCES "VerificationChecklistItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
