-- Keep any titles before dropping the column: the name is now the single property title.
UPDATE "Property" SET "name" = "title" WHERE "title" <> '';

-- CreateEnum
CREATE TYPE "PropertyAmenity" AS ENUM ('SWIMMING_POOL', 'PARKING', 'SECURITY', 'GENERATOR', 'GARDEN', 'GYM', 'AIR_CONDITIONING', 'ELEVATOR');

-- AlterTable
ALTER TABLE "Property" DROP COLUMN "title",
ADD COLUMN     "amenities" "PropertyAmenity"[] DEFAULT ARRAY[]::"PropertyAmenity"[],
ADD COLUMN     "bathrooms" INTEGER,
ADD COLUMN     "bedrooms" INTEGER,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "sizeSqm" DOUBLE PRECISION,
ADD COLUMN     "yearBuilt" INTEGER,
ALTER COLUMN "priceAmount" SET DATA TYPE BIGINT;

