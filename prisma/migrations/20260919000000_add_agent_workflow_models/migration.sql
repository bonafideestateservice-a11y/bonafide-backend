-- CreateEnum
CREATE TYPE "AgentAssignmentStatus" AS ENUM ('ASSIGNED', 'ACCEPTED', 'INSPECTION_SCHEDULED', 'INSPECTION_COMPLETE', 'REPORT_SUBMITTED');

-- CreateEnum
CREATE TYPE "ReportReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REVISION_REQUESTED');

-- CreateTable
CREATE TABLE "VerificationAgent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "region" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificationAgent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentAssignment" (
    "id" TEXT NOT NULL,
    "verificationRequestId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "status" "AgentAssignmentStatus" NOT NULL DEFAULT 'ASSIGNED',
    "progressPercent" INTEGER,
    "scheduledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentAssignment_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Document" ADD COLUMN "verificationReportId" TEXT;

-- AlterTable
ALTER TABLE "VerificationReport" ADD COLUMN "submittedByAgentId" TEXT NOT NULL;
ALTER TABLE "VerificationReport" ADD COLUMN "reviewStatus" "ReportReviewStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "VerificationReport" ADD COLUMN "rating" DOUBLE PRECISION;
ALTER TABLE "VerificationReport" ADD COLUMN "revisionNote" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "VerificationAgent_userId_key" ON "VerificationAgent"("userId");
CREATE UNIQUE INDEX "AgentAssignment_verificationRequestId_key" ON "AgentAssignment"("verificationRequestId");
CREATE INDEX "AgentAssignment_agentId_idx" ON "AgentAssignment"("agentId");
CREATE INDEX "Document_verificationReportId_idx" ON "Document"("verificationReportId");

-- AddForeignKey
ALTER TABLE "VerificationAgent" ADD CONSTRAINT "VerificationAgent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AgentAssignment" ADD CONSTRAINT "AgentAssignment_verificationRequestId_fkey" FOREIGN KEY ("verificationRequestId") REFERENCES "VerificationRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AgentAssignment" ADD CONSTRAINT "AgentAssignment_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "VerificationAgent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_verificationReportId_fkey" FOREIGN KEY ("verificationReportId") REFERENCES "VerificationReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VerificationReport" ADD CONSTRAINT "VerificationReport_submittedByAgentId_fkey" FOREIGN KEY ("submittedByAgentId") REFERENCES "VerificationAgent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;