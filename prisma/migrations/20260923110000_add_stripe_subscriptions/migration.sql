CREATE TYPE "StripeSubscriptionStatus" AS ENUM ('ACTIVE', 'INACTIVE');

CREATE TABLE "StripeSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "verificationRequestId" TEXT NOT NULL,
    "verificationPlanId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "status" "StripeSubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "currentPeriodEnd" TIMESTAMP(3),
    "lastRenewalDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StripeSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StripeSubscription_verificationRequestId_key" ON "StripeSubscription"("verificationRequestId");
CREATE UNIQUE INDEX "StripeSubscription_subscriptionId_key" ON "StripeSubscription"("subscriptionId");
CREATE INDEX "StripeSubscription_userId_idx" ON "StripeSubscription"("userId");
CREATE INDEX "StripeSubscription_verificationPlanId_idx" ON "StripeSubscription"("verificationPlanId");

ALTER TABLE "StripeSubscription" ADD CONSTRAINT "StripeSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StripeSubscription" ADD CONSTRAINT "StripeSubscription_verificationRequestId_fkey" FOREIGN KEY ("verificationRequestId") REFERENCES "VerificationRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StripeSubscription" ADD CONSTRAINT "StripeSubscription_verificationPlanId_fkey" FOREIGN KEY ("verificationPlanId") REFERENCES "VerificationPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
