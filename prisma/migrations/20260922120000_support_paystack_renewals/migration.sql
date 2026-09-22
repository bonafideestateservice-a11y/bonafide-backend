DROP INDEX "Transaction_verificationRequestId_key";

ALTER TABLE "Transaction"
ADD COLUMN "authorizationUrl" TEXT,
ADD COLUMN "accessCode" TEXT;

CREATE UNIQUE INDEX "Transaction_providerRef_key" ON "Transaction"("providerRef");
CREATE INDEX "Transaction_verificationRequestId_createdAt_idx"
ON "Transaction"("verificationRequestId", "createdAt");