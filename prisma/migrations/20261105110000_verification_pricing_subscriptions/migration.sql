-- CreateEnum
CREATE TYPE "VerificationTierCode" AS ENUM ('BASIC', 'STANDARD', 'PREMIUM');

-- CreateEnum
CREATE TYPE "MonitoringInterval" AS ENUM ('WEEKLY', 'MONTHLY', 'QUARTERLY');

-- CreateEnum
CREATE TYPE "NgnRoundingRule" AS ENUM ('NEAREST_KOBO');

-- CreateEnum
CREATE TYPE "ProviderPriceSyncStatus" AS ENUM ('PENDING', 'READY', 'FAILED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "PremiumQuoteStatus" AS ENUM ('REQUESTED', 'ISSUED', 'ACCEPTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MonitoringSubscriptionStatus" AS ENUM ('ACTIVE', 'NON_RENEWING', 'PAYMENT_FAILED', 'DISABLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SubscriptionPeriodStatus" AS ENUM ('PAID', 'IN_PROGRESS', 'COMPLETED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SiteVisitStatus" AS ENUM ('PENDING', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TransactionPurpose" AS ENUM ('INITIAL_PURCHASE', 'PREMIUM_QUOTE', 'RENEWAL');

-- AlterEnum
ALTER TYPE "VerificationStatus" ADD VALUE 'QUOTE_REQUIRED';

-- AlterTable
ALTER TABLE "VerificationRequest" ADD COLUMN     "monitoringPlanId" TEXT,
ADD COLUMN     "recurringConsent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "recurringConsentAt" TIMESTAMP(3),
ADD COLUMN     "verificationTierId" TEXT;

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "siteVisitId" TEXT;

-- AlterTable
ALTER TABLE "VerificationChecklistItem" ADD COLUMN     "result" JSONB,
ADD COLUMN     "sectionKey" TEXT;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "fxRate" DECIMAL(18,8),
ADD COLUMN     "fxRateVersion" INTEGER,
ADD COLUMN     "fxRoundingRule" "NgnRoundingRule",
ADD COLUMN     "monitoringAmountUsdCents" INTEGER,
ADD COLUMN     "premiumQuoteId" TEXT,
ADD COLUMN     "pricingSnapshot" JSONB,
ADD COLUMN     "provider" "PaymentProvider",
ADD COLUMN     "providerPriceVersionId" TEXT,
ADD COLUMN     "purpose" "TransactionPurpose",
ADD COLUMN     "tierAmountUsdCents" INTEGER,
ADD COLUMN     "totalUsdCents" INTEGER,
ADD COLUMN     "verificationTierId" TEXT;

-- AlterTable
ALTER TABLE "VerificationReport" ADD COLUMN     "packageScopeSnapshot" JSONB,
ADD COLUMN     "subscriptionPeriodId" TEXT,
ADD COLUMN     "tierNameSnapshot" TEXT,
ADD COLUMN     "verificationTierId" TEXT;

-- CreateTable
CREATE TABLE "VerificationTier" (
    "id" TEXT NOT NULL,
    "code" "VerificationTierCode" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priceUsdCents" INTEGER,
    "quoteRequired" BOOLEAN NOT NULL DEFAULT false,
    "minQuoteUsdCents" INTEGER,
    "maxQuoteUsdCents" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificationTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitoringPlan" (
    "id" TEXT NOT NULL,
    "code" "MonitoringInterval" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priceUsdCents" INTEGER NOT NULL,
    "intervalCount" INTEGER NOT NULL DEFAULT 1,
    "checksPerPeriod" INTEGER NOT NULL,
    "reportsPerPeriod" INTEGER NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonitoringPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingSettings" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "usdToNgnRate" DECIMAL(18,8) NOT NULL,
    "roundingRule" "NgnRoundingRule" NOT NULL DEFAULT 'NEAREST_KOBO',
    "active" BOOLEAN NOT NULL DEFAULT false,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderPriceVersion" (
    "id" TEXT NOT NULL,
    "verificationTierId" TEXT,
    "monitoringPlanId" TEXT,
    "legacyVerificationPlanId" TEXT,
    "provider" "PaymentProvider" NOT NULL,
    "providerProductId" TEXT,
    "providerPriceId" TEXT,
    "currency" VARCHAR(3) NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "usdAmountCents" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "interval" "MonitoringInterval",
    "intervalCount" INTEGER,
    "syncStatus" "ProviderPriceSyncStatus" NOT NULL DEFAULT 'PENDING',
    "syncError" TEXT,
    "activeForNewCheckout" BOOLEAN NOT NULL DEFAULT false,
    "syncedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderPriceVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PremiumQuote" (
    "id" TEXT NOT NULL,
    "verificationRequestId" TEXT NOT NULL,
    "verificationTierId" TEXT NOT NULL,
    "monitoringPlanId" TEXT,
    "pricingSettingsId" TEXT,
    "quoteUsdCents" INTEGER,
    "quoteNgnKobo" INTEGER,
    "usdToNgnRate" DECIMAL(18,8),
    "rateVersion" INTEGER,
    "roundingRule" "NgnRoundingRule",
    "tierVersion" INTEGER,
    "status" "PremiumQuoteStatus" NOT NULL DEFAULT 'REQUESTED',
    "expiresAt" TIMESTAMP(3),
    "issuedById" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PremiumQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitoringSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "verificationRequestId" TEXT NOT NULL,
    "monitoringPlanId" TEXT,
    "legacyVerificationPlanId" TEXT,
    "providerPriceVersionId" TEXT,
    "provider" "PaymentProvider" NOT NULL,
    "providerSubscriptionId" TEXT,
    "customerCode" TEXT,
    "emailToken" TEXT,
    "status" "MonitoringSubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "consentAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonitoringSubscription_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "MonitoringSubscription"
  ADD COLUMN "planVersion" INTEGER,
  ADD COLUMN "interval" "MonitoringInterval",
  ADD COLUMN "intervalCount" INTEGER,
  ADD COLUMN "priceUsdCents" INTEGER,
  ADD COLUMN "checksPerPeriod" INTEGER,
  ADD COLUMN "reportsPerPeriod" INTEGER;

-- CreateTable
CREATE TABLE "SubscriptionPeriod" (
    "id" TEXT NOT NULL,
    "verificationRequestId" TEXT NOT NULL,
    "monitoringSubscriptionId" TEXT NOT NULL,
    "monitoringPlanId" TEXT,
    "paidTransactionId" TEXT NOT NULL,
    "status" "SubscriptionPeriodStatus" NOT NULL DEFAULT 'PAID',
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "requiredSiteVisits" INTEGER NOT NULL,
    "completedSiteVisits" INTEGER NOT NULL DEFAULT 0,
    "requiredReports" INTEGER NOT NULL DEFAULT 1,
    "reportCount" INTEGER NOT NULL DEFAULT 0,
    "delayResolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteVisit" (
    "id" TEXT NOT NULL,
    "verificationRequestId" TEXT NOT NULL,
    "subscriptionPeriodId" TEXT,
    "visitNumber" INTEGER NOT NULL,
    "status" "SiteVisitStatus" NOT NULL DEFAULT 'PENDING',
    "scheduledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "location" JSONB,
    "checklist" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteVisit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VerificationTier_code_key" ON "VerificationTier"("code");

-- CreateIndex
CREATE INDEX "VerificationTier_active_code_idx" ON "VerificationTier"("active", "code");

-- CreateIndex
CREATE UNIQUE INDEX "MonitoringPlan_code_key" ON "MonitoringPlan"("code");

-- CreateIndex
CREATE INDEX "MonitoringPlan_active_code_idx" ON "MonitoringPlan"("active", "code");

-- CreateIndex
CREATE UNIQUE INDEX "PricingSettings_version_key" ON "PricingSettings"("version");

-- CreateIndex
CREATE INDEX "PricingSettings_active_idx" ON "PricingSettings"("active");

-- CreateIndex
CREATE INDEX "PricingSettings_updatedById_idx" ON "PricingSettings"("updatedById");

-- CreateIndex
CREATE INDEX "ProviderPriceVersion_provider_currency_activeForNewCheckout_idx" ON "ProviderPriceVersion"("provider", "currency", "activeForNewCheckout");

-- CreateIndex
CREATE INDEX "ProviderPriceVersion_syncStatus_idx" ON "ProviderPriceVersion"("syncStatus");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderPriceVersion_verificationTierId_provider_version_key" ON "ProviderPriceVersion"("verificationTierId", "provider", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderPriceVersion_monitoringPlanId_provider_version_key" ON "ProviderPriceVersion"("monitoringPlanId", "provider", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderPriceVersion_legacyVerificationPlanId_provider_vers_key" ON "ProviderPriceVersion"("legacyVerificationPlanId", "provider", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderPriceVersion_provider_providerPriceId_key" ON "ProviderPriceVersion"("provider", "providerPriceId");

-- CreateIndex
CREATE INDEX "PremiumQuote_verificationRequestId_createdAt_idx" ON "PremiumQuote"("verificationRequestId", "createdAt");

-- CreateIndex
CREATE INDEX "PremiumQuote_status_expiresAt_idx" ON "PremiumQuote"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "MonitoringSubscription_verificationRequestId_createdAt_idx" ON "MonitoringSubscription"("verificationRequestId", "createdAt");

-- CreateIndex
CREATE INDEX "MonitoringSubscription_userId_idx" ON "MonitoringSubscription"("userId");

-- CreateIndex
CREATE INDEX "MonitoringSubscription_monitoringPlanId_idx" ON "MonitoringSubscription"("monitoringPlanId");

-- CreateIndex
CREATE INDEX "MonitoringSubscription_legacyVerificationPlanId_idx" ON "MonitoringSubscription"("legacyVerificationPlanId");

-- CreateIndex
CREATE INDEX "MonitoringSubscription_status_currentPeriodEnd_idx" ON "MonitoringSubscription"("status", "currentPeriodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "MonitoringSubscription_provider_providerSubscriptionId_key" ON "MonitoringSubscription"("provider", "providerSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPeriod_paidTransactionId_key" ON "SubscriptionPeriod"("paidTransactionId");

-- CreateIndex
CREATE INDEX "SubscriptionPeriod_verificationRequestId_periodStart_idx" ON "SubscriptionPeriod"("verificationRequestId", "periodStart");

-- CreateIndex
CREATE INDEX "SubscriptionPeriod_monitoringSubscriptionId_periodStart_idx" ON "SubscriptionPeriod"("monitoringSubscriptionId", "periodStart");

-- CreateIndex
CREATE INDEX "SubscriptionPeriod_status_periodEnd_idx" ON "SubscriptionPeriod"("status", "periodEnd");

-- CreateIndex
CREATE INDEX "SiteVisit_verificationRequestId_status_idx" ON "SiteVisit"("verificationRequestId", "status");

-- CreateIndex
CREATE INDEX "SiteVisit_scheduledAt_idx" ON "SiteVisit"("scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "SiteVisit_subscriptionPeriodId_visitNumber_key" ON "SiteVisit"("subscriptionPeriodId", "visitNumber");

-- CreateIndex
CREATE INDEX "VerificationRequest_verificationTierId_idx" ON "VerificationRequest"("verificationTierId");

-- CreateIndex
CREATE INDEX "VerificationRequest_monitoringPlanId_idx" ON "VerificationRequest"("monitoringPlanId");

-- CreateIndex
CREATE INDEX "Document_siteVisitId_idx" ON "Document"("siteVisitId");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationReport_subscriptionPeriodId_key" ON "VerificationReport"("subscriptionPeriodId");

-- AddForeignKey
ALTER TABLE "PricingSettings" ADD CONSTRAINT "PricingSettings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderPriceVersion" ADD CONSTRAINT "ProviderPriceVersion_verificationTierId_fkey" FOREIGN KEY ("verificationTierId") REFERENCES "VerificationTier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderPriceVersion" ADD CONSTRAINT "ProviderPriceVersion_monitoringPlanId_fkey" FOREIGN KEY ("monitoringPlanId") REFERENCES "MonitoringPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderPriceVersion" ADD CONSTRAINT "ProviderPriceVersion_legacyVerificationPlanId_fkey" FOREIGN KEY ("legacyVerificationPlanId") REFERENCES "VerificationPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderPriceVersion" ADD CONSTRAINT "ProviderPriceVersion_syncedById_fkey" FOREIGN KEY ("syncedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationRequest" ADD CONSTRAINT "VerificationRequest_verificationTierId_fkey" FOREIGN KEY ("verificationTierId") REFERENCES "VerificationTier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationRequest" ADD CONSTRAINT "VerificationRequest_monitoringPlanId_fkey" FOREIGN KEY ("monitoringPlanId") REFERENCES "MonitoringPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_siteVisitId_fkey" FOREIGN KEY ("siteVisitId") REFERENCES "SiteVisit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_verificationTierId_fkey" FOREIGN KEY ("verificationTierId") REFERENCES "VerificationTier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_providerPriceVersionId_fkey" FOREIGN KEY ("providerPriceVersionId") REFERENCES "ProviderPriceVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_premiumQuoteId_fkey" FOREIGN KEY ("premiumQuoteId") REFERENCES "PremiumQuote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationReport" ADD CONSTRAINT "VerificationReport_verificationTierId_fkey" FOREIGN KEY ("verificationTierId") REFERENCES "VerificationTier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationReport" ADD CONSTRAINT "VerificationReport_subscriptionPeriodId_fkey" FOREIGN KEY ("subscriptionPeriodId") REFERENCES "SubscriptionPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PremiumQuote" ADD CONSTRAINT "PremiumQuote_verificationRequestId_fkey" FOREIGN KEY ("verificationRequestId") REFERENCES "VerificationRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PremiumQuote" ADD CONSTRAINT "PremiumQuote_verificationTierId_fkey" FOREIGN KEY ("verificationTierId") REFERENCES "VerificationTier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PremiumQuote" ADD CONSTRAINT "PremiumQuote_monitoringPlanId_fkey" FOREIGN KEY ("monitoringPlanId") REFERENCES "MonitoringPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PremiumQuote" ADD CONSTRAINT "PremiumQuote_pricingSettingsId_fkey" FOREIGN KEY ("pricingSettingsId") REFERENCES "PricingSettings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PremiumQuote" ADD CONSTRAINT "PremiumQuote_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringSubscription" ADD CONSTRAINT "MonitoringSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringSubscription" ADD CONSTRAINT "MonitoringSubscription_verificationRequestId_fkey" FOREIGN KEY ("verificationRequestId") REFERENCES "VerificationRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringSubscription" ADD CONSTRAINT "MonitoringSubscription_monitoringPlanId_fkey" FOREIGN KEY ("monitoringPlanId") REFERENCES "MonitoringPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringSubscription" ADD CONSTRAINT "MonitoringSubscription_legacyVerificationPlanId_fkey" FOREIGN KEY ("legacyVerificationPlanId") REFERENCES "VerificationPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringSubscription" ADD CONSTRAINT "MonitoringSubscription_providerPriceVersionId_fkey" FOREIGN KEY ("providerPriceVersionId") REFERENCES "ProviderPriceVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionPeriod" ADD CONSTRAINT "SubscriptionPeriod_verificationRequestId_fkey" FOREIGN KEY ("verificationRequestId") REFERENCES "VerificationRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionPeriod" ADD CONSTRAINT "SubscriptionPeriod_monitoringSubscriptionId_fkey" FOREIGN KEY ("monitoringSubscriptionId") REFERENCES "MonitoringSubscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionPeriod" ADD CONSTRAINT "SubscriptionPeriod_monitoringPlanId_fkey" FOREIGN KEY ("monitoringPlanId") REFERENCES "MonitoringPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionPeriod" ADD CONSTRAINT "SubscriptionPeriod_paidTransactionId_fkey" FOREIGN KEY ("paidTransactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteVisit" ADD CONSTRAINT "SiteVisit_verificationRequestId_fkey" FOREIGN KEY ("verificationRequestId") REFERENCES "VerificationRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteVisit" ADD CONSTRAINT "SiteVisit_subscriptionPeriodId_fkey" FOREIGN KEY ("subscriptionPeriodId") REFERENCES "SubscriptionPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Keep one active FX setting and one active provider version per sellable item/currency.
CREATE UNIQUE INDEX "PricingSettings_one_active_idx"
  ON "PricingSettings" ("active")
  WHERE "active" = true;

CREATE UNIQUE INDEX "PremiumQuote_active_request_idx"
  ON "PremiumQuote" ("verificationRequestId")
  WHERE "status" IN ('REQUESTED', 'ISSUED');

CREATE UNIQUE INDEX "ProviderPriceVersion_active_tier_idx"
  ON "ProviderPriceVersion" ("verificationTierId", "provider", "currency")
  WHERE "verificationTierId" IS NOT NULL AND "activeForNewCheckout" = true;

CREATE UNIQUE INDEX "ProviderPriceVersion_active_monitoring_idx"
  ON "ProviderPriceVersion" ("monitoringPlanId", "provider", "currency")
  WHERE "monitoringPlanId" IS NOT NULL AND "activeForNewCheckout" = true;

CREATE UNIQUE INDEX "ProviderPriceVersion_active_legacy_plan_idx"
  ON "ProviderPriceVersion" ("legacyVerificationPlanId", "provider", "currency")
  WHERE "legacyVerificationPlanId" IS NOT NULL AND "activeForNewCheckout" = true;

ALTER TABLE "PricingSettings"
  ADD CONSTRAINT "PricingSettings_positive_rate_check" CHECK ("usdToNgnRate" > 0),
  ADD CONSTRAINT "PricingSettings_positive_version_check" CHECK ("version" > 0);

ALTER TABLE "VerificationTier"
  ADD CONSTRAINT "VerificationTier_price_range_check"
  CHECK (
    ("priceUsdCents" IS NULL OR "priceUsdCents" > 0)
    AND ("minQuoteUsdCents" IS NULL OR "minQuoteUsdCents" > 0)
    AND ("maxQuoteUsdCents" IS NULL OR "maxQuoteUsdCents" >= "minQuoteUsdCents")
    AND ("quoteRequired" = false OR "priceUsdCents" IS NULL)
  );

ALTER TABLE "MonitoringPlan"
  ADD CONSTRAINT "MonitoringPlan_positive_terms_check"
  CHECK (
    "priceUsdCents" > 0
    AND "intervalCount" > 0
    AND "checksPerPeriod" > 0
    AND "reportsPerPeriod" > 0
    AND "version" > 0
  );

ALTER TABLE "ProviderPriceVersion"
  ADD CONSTRAINT "ProviderPriceVersion_exactly_one_target_check"
  CHECK (num_nonnulls("verificationTierId", "monitoringPlanId", "legacyVerificationPlanId") = 1),
  ADD CONSTRAINT "ProviderPriceVersion_positive_amount_check"
  CHECK ("amountMinor" > 0 AND "usdAmountCents" > 0 AND "version" > 0),
  ADD CONSTRAINT "ProviderPriceVersion_active_ready_check"
  CHECK ("activeForNewCheckout" = false OR "syncStatus" = 'READY');

ALTER TABLE "PremiumQuote"
  ADD CONSTRAINT "PremiumQuote_positive_amounts_check"
  CHECK (
    ("quoteUsdCents" IS NULL OR "quoteUsdCents" > 0)
    AND ("quoteNgnKobo" IS NULL OR "quoteNgnKobo" > 0)
    AND ("usdToNgnRate" IS NULL OR "usdToNgnRate" > 0)
    AND ("rateVersion" IS NULL OR "rateVersion" > 0)
  ),
  ADD CONSTRAINT "PremiumQuote_issued_quote_snapshot_check"
  CHECK (
    "status" NOT IN ('ISSUED', 'ACCEPTED')
    OR (
      "quoteUsdCents" IS NOT NULL
      AND "quoteNgnKobo" IS NOT NULL
      AND "usdToNgnRate" IS NOT NULL
      AND "rateVersion" IS NOT NULL
      AND "roundingRule" IS NOT NULL
      AND "tierVersion" IS NOT NULL
      AND "expiresAt" IS NOT NULL
      AND "issuedById" IS NOT NULL
    )
  );

ALTER TABLE "SubscriptionPeriod"
  ADD CONSTRAINT "SubscriptionPeriod_period_range_check" CHECK ("periodEnd" > "periodStart"),
  ADD CONSTRAINT "SubscriptionPeriod_counts_check"
  CHECK (
    "requiredSiteVisits" > 0
    AND "completedSiteVisits" >= 0
    AND "requiredReports" > 0
    AND "reportCount" >= 0
  );

ALTER TABLE "SiteVisit"
  ADD CONSTRAINT "SiteVisit_positive_number_check" CHECK ("visitNumber" > 0);

-- Copy legacy provider identifiers into the versioned map while keeping them inactive for new
-- checkouts. The original VerificationPlan columns remain untouched for older application code.
WITH legacy_prices AS (
  SELECT
    vp."id" AS "legacyVerificationPlanId",
    vp."frequency",
    vp."priceUsdCents",
    vp."priceNgnKobo",
    'STRIPE'::"PaymentProvider" AS "provider",
    vp."stripePriceId" AS "providerPriceId",
    'USD'::VARCHAR(3) AS "currency",
    vp."priceUsdCents" AS "amountMinor",
    vp."priceUsdCents" AS "usdAmountCents",
    vp."createdAt",
    vp."updatedAt"
  FROM "VerificationPlan" vp
  WHERE vp."stripePriceId" IS NOT NULL

  UNION ALL

  SELECT
    vp."id",
    vp."frequency",
    vp."priceUsdCents",
    vp."priceNgnKobo",
    'PAYSTACK'::"PaymentProvider",
    vp."paystackNgnPlanCode",
    'NGN'::VARCHAR(3),
    vp."priceNgnKobo",
    vp."priceUsdCents",
    vp."createdAt",
    vp."updatedAt"
  FROM "VerificationPlan" vp
  WHERE vp."paystackNgnPlanCode" IS NOT NULL

  UNION ALL

  SELECT
    vp."id",
    vp."frequency",
    vp."priceUsdCents",
    vp."priceNgnKobo",
    'PAYSTACK'::"PaymentProvider",
    vp."paystackPlanCode",
    'NGN'::VARCHAR(3),
    vp."priceNgnKobo",
    vp."priceUsdCents",
    vp."createdAt",
    vp."updatedAt"
  FROM "VerificationPlan" vp
  WHERE vp."paystackPlanCode" IS NOT NULL
),
distinct_prices AS (
  SELECT DISTINCT ON ("legacyVerificationPlanId", "provider", "providerPriceId")
    *
  FROM legacy_prices
  ORDER BY "legacyVerificationPlanId", "provider", "providerPriceId"
),
numbered_prices AS (
  SELECT
    *,
    ROW_NUMBER() OVER (
      PARTITION BY "legacyVerificationPlanId", "provider"
      ORDER BY "providerPriceId"
    )::INTEGER AS "version"
  FROM distinct_prices
)
INSERT INTO "ProviderPriceVersion" (
  "id", "legacyVerificationPlanId", "provider", "providerPriceId", "currency",
  "amountMinor", "usdAmountCents", "version", "interval", "intervalCount",
  "syncStatus", "activeForNewCheckout", "createdAt", "updatedAt"
)
SELECT
  'legacy_price_' || md5("legacyVerificationPlanId" || ':' || "provider"::text || ':' || "providerPriceId"),
  "legacyVerificationPlanId",
  "provider",
  "providerPriceId",
  "currency",
  "amountMinor",
  "usdAmountCents",
  "version",
  CASE "frequency"
    WHEN 'MONTHLY' THEN 'MONTHLY'::"MonitoringInterval"
    WHEN 'QUARTERLY' THEN 'QUARTERLY'::"MonitoringInterval"
    ELSE NULL
  END,
  CASE
    WHEN "frequency" = 'QUARTERLY' THEN 3
    WHEN "frequency" = 'MONTHLY' THEN 1
    ELSE NULL
  END,
  'READY'::"ProviderPriceSyncStatus",
  false,
  "createdAt",
  "updatedAt"
FROM numbered_prices
ON CONFLICT ("provider", "providerPriceId") DO NOTHING;

-- Preserve existing subscription/provider mappings without changing their terms or legacy plans.
INSERT INTO "MonitoringSubscription" (
  "id", "userId", "verificationRequestId", "legacyVerificationPlanId",
  "provider", "providerSubscriptionId", "customerCode", "emailToken", "status",
  "planVersion", "interval", "intervalCount", "priceUsdCents",
  "checksPerPeriod", "reportsPerPeriod",
  "currentPeriodEnd", "startedAt", "disabledAt", "createdAt", "updatedAt"
)
SELECT
  'legacy_paystack_' || ps."id",
  ps."userId",
  ps."verificationRequestId",
  ps."verificationPlanId",
  'PAYSTACK'::"PaymentProvider",
  ps."subscriptionCode",
  ps."customerCode",
  ps."emailToken",
  ps."status"::text::"MonitoringSubscriptionStatus",
  1,
  CASE p."frequency"
    WHEN 'MONTHLY' THEN 'MONTHLY'::"MonitoringInterval"
    WHEN 'QUARTERLY' THEN 'QUARTERLY'::"MonitoringInterval"
    ELSE NULL
  END,
  CASE WHEN p."frequency" = 'QUARTERLY' THEN 3 WHEN p."frequency" = 'MONTHLY' THEN 1 ELSE NULL END,
  p."priceUsdCents",
  1,
  1,
  ps."nextPaymentDate",
  ps."startedAt",
  ps."disabledAt",
  ps."createdAt",
  ps."updatedAt"
FROM "PaystackSubscription" ps
JOIN "VerificationPlan" p ON p."id" = ps."verificationPlanId"
ON CONFLICT ("provider", "providerSubscriptionId") DO NOTHING;

INSERT INTO "MonitoringSubscription" (
  "id", "userId", "verificationRequestId", "legacyVerificationPlanId",
  "provider", "providerSubscriptionId", "status",
  "planVersion", "interval", "intervalCount", "priceUsdCents",
  "checksPerPeriod", "reportsPerPeriod", "currentPeriodEnd",
  "startedAt", "createdAt", "updatedAt"
)
SELECT
  'legacy_stripe_' || ss."id",
  ss."userId",
  ss."verificationRequestId",
  ss."verificationPlanId",
  'STRIPE'::"PaymentProvider",
  ss."subscriptionId",
  CASE ss."status"
    WHEN 'ACTIVE' THEN 'ACTIVE'::"MonitoringSubscriptionStatus"
    ELSE 'DISABLED'::"MonitoringSubscriptionStatus"
  END,
  1,
  CASE p."frequency"
    WHEN 'MONTHLY' THEN 'MONTHLY'::"MonitoringInterval"
    WHEN 'QUARTERLY' THEN 'QUARTERLY'::"MonitoringInterval"
    ELSE NULL
  END,
  CASE WHEN p."frequency" = 'QUARTERLY' THEN 3 WHEN p."frequency" = 'MONTHLY' THEN 1 ELSE NULL END,
  p."priceUsdCents",
  1,
  1,
  ss."currentPeriodEnd",
  ss."lastRenewalDate",
  ss."createdAt",
  ss."updatedAt"
FROM "StripeSubscription" ss
JOIN "VerificationPlan" p ON p."id" = ss."verificationPlanId"
ON CONFLICT ("provider", "providerSubscriptionId") DO NOTHING;
