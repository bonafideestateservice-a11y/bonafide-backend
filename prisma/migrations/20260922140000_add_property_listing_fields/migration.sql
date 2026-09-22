-- CreateEnum
CREATE TYPE "PropertyType" AS ENUM ('RESIDENTIAL', 'COMMERCIAL', 'LAND');

-- AlterTable
ALTER TABLE "Property"
  ADD COLUMN "title" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "propertyType" "PropertyType" NOT NULL DEFAULT 'RESIDENTIAL',
  ADD COLUMN "area" TEXT,
  ADD COLUMN "city" TEXT,
  ADD COLUMN "country" TEXT,
  ADD COLUMN "priceAmount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "priceCurrency" TEXT NOT NULL DEFAULT 'NGN',
  ADD COLUMN "viewCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "coverImageUrl" TEXT,
  ADD COLUMN "isPublished" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Property_isPublished_createdAt_idx" ON "Property"("isPublished", "createdAt");