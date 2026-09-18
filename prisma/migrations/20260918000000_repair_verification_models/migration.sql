-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('DRAFT', 'PENDING_PAYMENT', 'PAYMENT_FAILED', 'SUBMITTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CARD', 'PAYPAL');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "VerificationRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "verificationTypeId" TEXT NOT NULL,
    "verificationPlanId" TEXT,
    "status" "VerificationStatus" NOT NULL DEFAULT 'DRAFT',
    "details" JSONB NOT NULL,
    "additionalNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "verificationRequestId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "verificationRequestId" TEXT NOT NULL,
    "amountInCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "providerRef" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationReport" (
    "id" TEXT NOT NULL,
    "verificationRequestId" TEXT NOT NULL,
    "summary" TEXT,
    "findings" JSONB,
    "reportUrl" TEXT,
    "generatedAt" TIMESTAMP(3),
    "viewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificationReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VerificationRequest_userId_idx" ON "VerificationRequest"("userId");

CREATE INDEX "VerificationRequest_verificationTypeId_idx" ON "VerificationRequest"("verificationTypeId");

CREATE INDEX "Document_verificationRequestId_idx" ON "Document"("verificationRequestId");

CREATE UNIQUE INDEX "Transaction_verificationRequestId_key" ON "Transaction"("verificationRequestId");

CREATE UNIQUE INDEX "VerificationReport_verificationRequestId_key" ON "VerificationReport"("verificationRequestId");

CREATE INDEX "VerificationReport_viewedAt_idx" ON "VerificationReport"("viewedAt");

-- AddForeignKey
ALTER TABLE "VerificationRequest" ADD CONSTRAINT "VerificationRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "VerificationRequest" ADD CONSTRAINT "VerificationRequest_verificationTypeId_fkey" FOREIGN KEY ("verificationTypeId") REFERENCES "VerificationType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "VerificationRequest" ADD CONSTRAINT "VerificationRequest_verificationPlanId_fkey" FOREIGN KEY ("verificationPlanId") REFERENCES "VerificationPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Document" ADD CONSTRAINT "Document_verificationRequestId_fkey" FOREIGN KEY ("verificationRequestId") REFERENCES "VerificationRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_verificationRequestId_fkey" FOREIGN KEY ("verificationRequestId") REFERENCES "VerificationRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "VerificationReport" ADD CONSTRAINT "VerificationReport_verificationRequestId_fkey" FOREIGN KEY ("verificationRequestId") REFERENCES "VerificationRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
