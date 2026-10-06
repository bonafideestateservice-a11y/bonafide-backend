-- Schema that existing databases already have (it was applied outside migrations) but the
-- migration history never created: notifications, FCM tokens, OAuth fields on User, and
-- index changes. Every statement is guarded, so this is a no-op on those databases and
-- completes the schema on a fresh one.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'NotificationType') THEN
    CREATE TYPE "NotificationType" AS ENUM ('USER_REGISTERED', 'USER_LOGIN', 'PAYMENT_RECEIVED', 'FORGOT_PASSWORD', 'VERIFICATION_REQUEST_CREATED', 'REPORT_UPLOADED', 'AGENT_ASSIGNED', 'INSPECTION_STARTED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'NotificationStatus') THEN
    CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');
  END IF;
END $$;

DROP INDEX IF EXISTS "PasswordResetToken_userId_idx";
DROP INDEX IF EXISTS "User_role_idx";

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "provider" TEXT DEFAULT 'local',
ADD COLUMN IF NOT EXISTS "providerId" TEXT,
ALTER COLUMN "password" DROP NOT NULL;

CREATE TABLE IF NOT EXISTS "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "serviceId" TEXT,
    "verificationTypeId" TEXT,
    "verificationRequestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notificationStatus" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "body" TEXT,
    "meta" JSONB,
    "sentAt" TIMESTAMP(3),
    "title" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "FCMToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "token" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FCMToken_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "Notification_serviceId_idx" ON "Notification"("serviceId");
CREATE INDEX IF NOT EXISTS "Notification_verificationTypeId_idx" ON "Notification"("verificationTypeId");
CREATE INDEX IF NOT EXISTS "Notification_verificationRequestId_idx" ON "Notification"("verificationRequestId");
CREATE UNIQUE INDEX IF NOT EXISTS "FCMToken_token_key" ON "FCMToken"("token");
CREATE INDEX IF NOT EXISTS "FCMToken_token_idx" ON "FCMToken"("token");
CREATE INDEX IF NOT EXISTS "FCMToken_userId_idx" ON "FCMToken"("userId");
CREATE INDEX IF NOT EXISTS "PasswordResetToken_userId_createdAt_idx" ON "PasswordResetToken"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "PasswordResetToken_createdAt_idx" ON "PasswordResetToken"("createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "User_providerId_key" ON "User"("providerId");
CREATE INDEX IF NOT EXISTS "User_role_createdAt_idx" ON "User"("role", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Notification_userId_fkey') THEN
    ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Notification_serviceId_fkey') THEN
    ALTER TABLE "Notification" ADD CONSTRAINT "Notification_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Notification_verificationTypeId_fkey') THEN
    ALTER TABLE "Notification" ADD CONSTRAINT "Notification_verificationTypeId_fkey" FOREIGN KEY ("verificationTypeId") REFERENCES "VerificationType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Notification_verificationRequestId_fkey') THEN
    ALTER TABLE "Notification" ADD CONSTRAINT "Notification_verificationRequestId_fkey" FOREIGN KEY ("verificationRequestId") REFERENCES "VerificationRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FCMToken_userId_fkey') THEN
    ALTER TABLE "FCMToken" ADD CONSTRAINT "FCMToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
