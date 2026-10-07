-- AlterTable
ALTER TABLE "Property" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "number" SERIAL NOT NULL;

-- CreateTable
CREATE TABLE "PropertyInquiry" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PropertyInquiry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertyFavorite" (
    "userId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PropertyFavorite_pkey" PRIMARY KEY ("userId","propertyId")
);

-- CreateIndex
CREATE INDEX "PropertyInquiry_propertyId_idx" ON "PropertyInquiry"("propertyId");

-- CreateIndex
CREATE INDEX "PropertyFavorite_propertyId_idx" ON "PropertyFavorite"("propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "Property_number_key" ON "Property"("number");

-- AddForeignKey
ALTER TABLE "PropertyInquiry" ADD CONSTRAINT "PropertyInquiry_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyInquiry" ADD CONSTRAINT "PropertyInquiry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyFavorite" ADD CONSTRAINT "PropertyFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyFavorite" ADD CONSTRAINT "PropertyFavorite_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

