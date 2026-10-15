-- CreateEnum
CREATE TYPE "PropertyUpdateKind" AS ENUM ('PROGRESS', 'MILESTONE', 'NOTICE');

-- CreateEnum
CREATE TYPE "PropertyDocumentSource" AS ENUM ('BONAFIDE', 'CLIENT');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'PROPERTY_REQUEST_UPDATED';

-- AlterEnum
ALTER TYPE "PropertyRequestStatus" ADD VALUE 'OWNERSHIP_TRANSFER';

-- AlterTable
ALTER TABLE "PropertyRequestUpdate" ADD COLUMN     "kind" "PropertyUpdateKind" NOT NULL DEFAULT 'PROGRESS',
ADD COLUMN     "title" TEXT;

-- CreateTable
CREATE TABLE "PropertyRequestDocument" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" "PropertyDocumentSource" NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "publicId" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PropertyRequestDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PropertyRequestDocument_requestId_idx" ON "PropertyRequestDocument"("requestId");

-- AddForeignKey
ALTER TABLE "PropertyRequestDocument" ADD CONSTRAINT "PropertyRequestDocument_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PropertyRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

