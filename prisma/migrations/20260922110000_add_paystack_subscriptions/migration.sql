CREATE TYPE "PaystackSubscriptionStatus" AS ENUM ('ACTIVE', 'NON_RENEWING', 'PAYMENT_FAILED', 'DISABLED', 'EXPIRED');

CREATE TABLE "PaystackSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "verificationRequestId" TEXT NOT NULL,
    "verificationPlanId" TEXT NOT NULL,
    "customerCode" TEXT NOT NULL,
    "subscriptionCode" TEXT NOT NULL,
    "emailToken" TEXT,
    "status" "PaystackSubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "nextPaymentDate" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaystackSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaystackSubscription_verificationRequestId_key" ON "PaystackSubscription"("verificationRequestId");
CREATE UNIQUE INDEX "PaystackSubscription_subscriptionCode_key" ON "PaystackSubscription"("subscriptionCode");
CREATE INDEX "PaystackSubscription_userId_idx" ON "PaystackSubscription"("userId");
CREATE INDEX "PaystackSubscription_verificationPlanId_idx" ON "PaystackSubscription"("verificationPlanId");
CREATE INDEX "PaystackSubscription_customerCode_idx" ON "PaystackSubscription"("customerCode");

ALTER TABLE "PaystackSubscription" ADD CONSTRAINT "PaystackSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaystackSubscription" ADD CONSTRAINT "PaystackSubscription_verificationRequestId_fkey" FOREIGN KEY ("verificationRequestId") REFERENCES "VerificationRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaystackSubscription" ADD CONSTRAINT "PaystackSubscription_verificationPlanId_fkey" FOREIGN KEY ("verificationPlanId") REFERENCES "VerificationPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;