-- CreateEnum
CREATE TYPE "PropertyRequestType" AS ENUM ('PURCHASE', 'CONSULTATION');

-- CreateEnum
CREATE TYPE "PropertyRequestStatus" AS ENUM ('SUBMITTED', 'CONSULTATION', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PropertyPaymentStatus" AS ENUM ('READY', 'PROCESSING', 'SUCCESSFUL', 'FAILED');

-- CreateEnum
CREATE TYPE "PropertyPaymentMethod" AS ENUM ('CARD', 'BANK_TRANSFER');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('PAYSTACK', 'STRIPE');

-- CreateTable
CREATE TABLE "PropertyRequest" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "type" "PropertyRequestType" NOT NULL,
    "status" "PropertyRequestStatus" NOT NULL DEFAULT 'SUBMITTED',
    "propertyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PropertyRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertyRequestUpdate" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "status" "PropertyRequestStatus" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PropertyRequestUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertyPayment" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "amountInKobo" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "status" "PropertyPaymentStatus" NOT NULL DEFAULT 'READY',
    "provider" "PaymentProvider",
    "method" "PropertyPaymentMethod",
    "providerRef" TEXT,
    "checkoutUrl" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PropertyPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "statusCode" INTEGER,
    "body" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PropertyRequest_reference_key" ON "PropertyRequest"("reference");

-- CreateIndex
CREATE INDEX "PropertyRequest_userId_idx" ON "PropertyRequest"("userId");

-- CreateIndex
CREATE INDEX "PropertyRequest_propertyId_idx" ON "PropertyRequest"("propertyId");

-- CreateIndex
CREATE INDEX "PropertyRequest_status_idx" ON "PropertyRequest"("status");

-- CreateIndex
CREATE INDEX "PropertyRequestUpdate_requestId_idx" ON "PropertyRequestUpdate"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "PropertyPayment_reference_key" ON "PropertyPayment"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "PropertyPayment_requestId_key" ON "PropertyPayment"("requestId");

-- CreateIndex
CREATE INDEX "PropertyPayment_status_idx" ON "PropertyPayment"("status");

-- CreateIndex
CREATE INDEX "IdempotencyKey_createdAt_idx" ON "IdempotencyKey"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_userId_route_key_key" ON "IdempotencyKey"("userId", "route", "key");

-- AddForeignKey
ALTER TABLE "PropertyRequest" ADD CONSTRAINT "PropertyRequest_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyRequest" ADD CONSTRAINT "PropertyRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyRequestUpdate" ADD CONSTRAINT "PropertyRequestUpdate_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PropertyRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyPayment" ADD CONSTRAINT "PropertyPayment_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PropertyRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

