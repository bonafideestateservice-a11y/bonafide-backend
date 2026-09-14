-- CreateEnum
CREATE TYPE "VERIFICATION_FREQUENCY" AS ENUM ('ONE_TIME', 'MONTHLY', 'QUARTERLY');

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationType" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificationType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationPlan" (
    "id" TEXT NOT NULL,
    "verificationTypeId" TEXT NOT NULL,
    "frequency" "VERIFICATION_FREQUENCY" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priceInCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificationPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Service_slug_key" ON "Service"("slug");

-- CreateIndex
CREATE INDEX "VerificationType_serviceId_idx" ON "VerificationType"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationType_slug_key" ON "VerificationType"("slug");

-- CreateIndex
CREATE INDEX "VerificationPlan_verificationTypeId_idx" ON "VerificationPlan"("verificationTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationPlan_verificationTypeId_frequency_key" ON "VerificationPlan"("verificationTypeId", "frequency");

-- AddForeignKey
ALTER TABLE "VerificationType" ADD CONSTRAINT "VerificationType_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationPlan" ADD CONSTRAINT "VerificationPlan_verificationTypeId_fkey" FOREIGN KEY ("verificationTypeId") REFERENCES "VerificationType"("id") ON DELETE CASCADE ON UPDATE CASCADE;