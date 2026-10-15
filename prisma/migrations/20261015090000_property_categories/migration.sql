-- AlterEnum
BEGIN;
CREATE TYPE "PropertyType_new" AS ENUM ('HOUSE', 'APARTMENT', 'LAND', 'COMMERCIAL');
ALTER TABLE "Property" ALTER COLUMN "propertyType" DROP DEFAULT;
-- Existing RESIDENTIAL properties become HOUSE (change any apartments by hand afterwards).
ALTER TABLE "Property" ALTER COLUMN "propertyType" TYPE "PropertyType_new" USING (
  CASE WHEN "propertyType"::text = 'RESIDENTIAL' THEN 'HOUSE' ELSE "propertyType"::text END
)::"PropertyType_new";
ALTER TYPE "PropertyType" RENAME TO "PropertyType_old";
ALTER TYPE "PropertyType_new" RENAME TO "PropertyType";
DROP TYPE "PropertyType_old";
ALTER TABLE "Property" ALTER COLUMN "propertyType" SET DEFAULT 'HOUSE';
COMMIT;

-- AlterEnum
ALTER TYPE "PropertyAmenity" ADD VALUE 'ROAD_ACCESS';

-- AlterTable
ALTER TABLE "Property" ALTER COLUMN "propertyType" SET DEFAULT 'HOUSE';

