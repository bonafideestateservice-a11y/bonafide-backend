-- AlterTable
ALTER TABLE "VerificationRequest" ADD COLUMN     "notifyOnInspectionStart" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyOnReportReady" BOOLEAN NOT NULL DEFAULT true;