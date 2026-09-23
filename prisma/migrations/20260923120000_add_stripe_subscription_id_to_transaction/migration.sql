ALTER TABLE "Transaction" ADD COLUMN "stripeSubscriptionId" TEXT;

CREATE INDEX "Transaction_stripeSubscriptionId_createdAt_idx" ON "Transaction"("stripeSubscriptionId", "createdAt");
