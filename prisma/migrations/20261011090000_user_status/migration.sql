-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "NotificationSettings" ALTER COLUMN "email" SET DEFAULT true,
ALTER COLUMN "push" SET DEFAULT true;


-- Agents suspended before this change can't log in either.
UPDATE "User" SET "status" = 'SUSPENDED'
WHERE "id" IN (SELECT "userId" FROM "VerificationAgent" WHERE "status" = 'INACTIVE');
