-- Add Paystack identifiers used to initialize verification payments.
ALTER TABLE "User"
ADD COLUMN "paystackCustomerCode" TEXT;

ALTER TABLE "VerificationPlan"
ADD COLUMN "paystackPlanCode" TEXT;

CREATE UNIQUE INDEX "User_paystackCustomerCode_key"
ON "User"("paystackCustomerCode");

CREATE UNIQUE INDEX "VerificationPlan_paystackPlanCode_key"
ON "VerificationPlan"("paystackPlanCode");
