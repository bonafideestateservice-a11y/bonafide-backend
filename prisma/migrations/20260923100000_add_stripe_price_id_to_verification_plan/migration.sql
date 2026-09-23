ALTER TABLE "VerificationPlan" ADD COLUMN "stripePriceId" TEXT;

CREATE UNIQUE INDEX "VerificationPlan_stripePriceId_key" ON "VerificationPlan"("stripePriceId");