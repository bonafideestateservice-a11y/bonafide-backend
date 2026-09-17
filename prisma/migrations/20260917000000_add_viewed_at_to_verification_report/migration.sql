ALTER TABLE "VerificationReport" ADD COLUMN "viewedAt" TIMESTAMP(3);

CREATE INDEX "VerificationReport_viewedAt_idx" ON "VerificationReport"("viewedAt");