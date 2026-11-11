import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

import {
  MonitoringInterval,
  NgnRoundingRule,
  Prisma,
  ROLE,
  VERIFICATION_FREQUENCY,
  VerificationTierCode,
} from "@prisma/client";
import { prismaClient } from "../src/utils/prisma";
import { hashPassword } from "../src/utils/password";
import { logger } from "../src/utils/logger";

const ADMIN_EMAIL = process.env.ADMIN_SEED_EMAIL || "admin@bonafide.com";
const ADMIN_PASSWORD = process.env.ADMIN_SEED_PASSWORD || "Admin@123";
const ADMIN_NAME = process.env.ADMIN_SEED_NAME || "Super Admin";

const verificationChecklist = [
  { label: "Physical verification", requiresMedia: true },
  { label: "Court/crime verification", requiresMedia: true },
  { label: "Title deeds and documentation verification", requiresMedia: true },
  { label: "Valuation verification", requiresMedia: true },
  { label: "Amenities and environment verification", requiresMedia: true },
] as const;

const verificationTypes = [
  {
    slug: "property-verification",
    name: "Property Verification",
    description: "Verify ownership, condition and legal standing",
    icon: "property",
    checklist: verificationChecklist,
    plans: [
      {
        frequency: VERIFICATION_FREQUENCY.ONE_TIME,
        name: "One time verification",
        description: "A single inspection with a full report",
        priceUsdCents: 4500,
        priceNgnKobo: 7200000,
      },
      {
        frequency: VERIFICATION_FREQUENCY.MONTHLY,
        name: "Monthly Update",
        description: "Detailed report every month",
        priceUsdCents: 3500,
        priceNgnKobo: 5600000,
      },
      {
        frequency: VERIFICATION_FREQUENCY.QUARTERLY,
        name: "Quarterly Update",
        description: "Detailed report every 3 months",
        priceUsdCents: 3500,
        priceNgnKobo: 5600000,
      },
    ],
  },
  {
    slug: "construction-progress",
    name: "Construction Progress",
    description: "Track milestones with photo, videos, & agent report",
    icon: "construction",
    checklist: verificationChecklist,
    plans: [
      {
        frequency: VERIFICATION_FREQUENCY.ONE_TIME,
        name: "One time verification",
        description: "A single inspection with a full report",
        priceUsdCents: 4500,
        priceNgnKobo: 7200000,
      },
      {
        frequency: VERIFICATION_FREQUENCY.MONTHLY,
        name: "Monthly Update",
        description: "Detailed report every month",
        priceUsdCents: 3500,
        priceNgnKobo: 5600000,
      },
      {
        frequency: VERIFICATION_FREQUENCY.QUARTERLY,
        name: "Quarterly Update",
        description: "Detailed report every 3 months",
        priceUsdCents: 3500,
        priceNgnKobo: 5600000,
      },
    ],
  },
  {
    slug: "business-verification",
    name: "Business Verification",
    description: "Confirm business legitimacy, operations & ownership",
    icon: "business",
    checklist: verificationChecklist,
    plans: [
      {
        frequency: VERIFICATION_FREQUENCY.ONE_TIME,
        name: "One time verification",
        description: "A single inspection with a full report",
        priceUsdCents: 4500,
        priceNgnKobo: 7200000,
      },
      {
        frequency: VERIFICATION_FREQUENCY.MONTHLY,
        name: "Monthly Update",
        description: "Detailed report every month",
        priceUsdCents: 3500,
        priceNgnKobo: 5600000,
      },
      {
        frequency: VERIFICATION_FREQUENCY.QUARTERLY,
        name: "Quarterly Update",
        description: "Detailed report every 3 months",
        priceUsdCents: 3500,
        priceNgnKobo: 5600000,
      },
    ],
  },
] as const;

const verificationTiers = [
  {
    code: VerificationTierCode.BASIC,
    name: "Basic",
    description:
      "One site visit, brief local enquiries, and photos or video where needed, with one short report.",
    features: [
      "One site visit",
      "Brief local enquiries",
      "Photos or video where needed",
      "One short report",
    ],
    priceUsdCents: 2500,
    quoteRequired: false,
    minQuoteUsdCents: null,
    maxQuoteUsdCents: null,
  },
  {
    code: VerificationTierCode.STANDARD,
    name: "Standard",
    description:
      "Everything in Basic, plus a land registry check, court-records search, local intelligence gathering, and one detailed report.",
    features: [
      "Everything in Basic",
      "Land registry check",
      "Court-records search",
      "Local intelligence gathering",
      "One detailed report",
    ],
    priceUsdCents: 6000,
    quoteRequired: false,
    minQuoteUsdCents: null,
    maxQuoteUsdCents: null,
  },
  {
    code: VerificationTierCode.PREMIUM,
    name: "Premium",
    description:
      "Everything in Standard, plus a property valuation and feasibility report for the property's intended use.",
    features: [
      "Everything in Standard",
      "Property valuation",
      "Feasibility report for the property's intended use",
    ],
    priceUsdCents: null,
    quoteRequired: true,
    minQuoteUsdCents: 10000,
    maxQuoteUsdCents: 20000,
  },
] as const;

const monitoringPlans = [
  {
    code: MonitoringInterval.WEEKLY,
    name: "Weekly Monitoring",
    description: "One site check and one report each week.",
    priceUsdCents: 3500,
    intervalCount: 1,
    checksPerPeriod: 1,
    reportsPerPeriod: 1,
  },
  {
    code: MonitoringInterval.MONTHLY,
    name: "Monthly Monitoring",
    description: "Two site checks and one report each month.",
    priceUsdCents: 6000,
    intervalCount: 1,
    checksPerPeriod: 2,
    reportsPerPeriod: 1,
  },
  {
    code: MonitoringInterval.QUARTERLY,
    name: "Quarterly Monitoring",
    description: "Three site checks and one report every three months.",
    priceUsdCents: 20000,
    intervalCount: 3,
    checksPerPeriod: 3,
    reportsPerPeriod: 1,
  },
] as const;

const readInitialUsdToNgnRate = (value: string | undefined) => {
  if (!value || !/^\d{1,10}(\.\d{1,8})?$/.test(value)) {
    throw new Error(
      "INITIAL_USD_TO_NGN_RATE must be set to a positive decimal with at most 10 integer and 8 fractional digits",
    );
  }
  const rate = new Prisma.Decimal(value);
  if (!rate.isFinite() || !rate.greaterThan(0)) {
    throw new Error("INITIAL_USD_TO_NGN_RATE must be greater than zero");
  }
  return rate;
};

async function seed() {
  const [activePricingSettings, latestPricingSettings] = await Promise.all([
    prismaClient.pricingSettings.findFirst({ where: { active: true } }),
    prismaClient.pricingSettings.findFirst({ orderBy: { version: "desc" } }),
  ]);
  const initialRate = activePricingSettings
    ? undefined
    : readInitialUsdToNgnRate(process.env.INITIAL_USD_TO_NGN_RATE);

  const hashedPassword = await hashPassword(ADMIN_PASSWORD);

  const admin = await prismaClient.user.upsert({
    where: { email: ADMIN_EMAIL.toLowerCase() },
    update: {
      fullName: ADMIN_NAME,
      password: hashedPassword,
      role: ROLE.ADMIN,
      termsAndCondition: true,
    },
    create: {
      fullName: ADMIN_NAME,
      email: ADMIN_EMAIL.toLowerCase(),
      password: hashedPassword,
      role: ROLE.ADMIN,
      termsAndCondition: true,
    },
  });

  logger.info(`Admin seeded: email=${admin.email} role=${admin.role}`);

  const verificationService = await prismaClient.service.upsert({
    where: { slug: "verification" },
    update: {
      name: "Verification",
      description: "Verify property, construction, and business standing",
    },
    create: {
      name: "Verification",
      slug: "verification",
      description: "Verify property, construction, and business standing",
    },
  });

  for (const type of verificationTypes) {
    const verificationType = await prismaClient.verificationType.upsert({
      where: { slug: type.slug },
      update: {
        serviceId: verificationService.id,
        name: type.name,
        description: type.description,
        icon: type.icon,
      },
      create: {
        serviceId: verificationService.id,
        name: type.name,
        slug: type.slug,
        description: type.description,
        icon: type.icon,
      },
    });

    for (const plan of type.plans) {
      await prismaClient.verificationPlan.upsert({
        where: {
          verificationTypeId_frequency: {
            verificationTypeId: verificationType.id,
            frequency: plan.frequency,
          },
        },
        update: {
          name: plan.name,
          description: plan.description,
        },
        create: {
          verificationTypeId: verificationType.id,
          frequency: plan.frequency,
          name: plan.name,
          description: plan.description,
          priceUsdCents: plan.priceUsdCents,
          priceNgnKobo: plan.priceNgnKobo,
        },
      });
    }

    await prismaClient.checklistTemplateItem.deleteMany({
      where: { verificationTypeId: verificationType.id },
    });
    await prismaClient.checklistTemplateItem.createMany({
      data: type.checklist.map((item, index) => ({
        verificationTypeId: verificationType.id,
        label: item.label,
        requiresMedia: item.requiresMedia,
        sortOrder: index,
      })),
    });
  }

  for (const tier of verificationTiers) {
    await prismaClient.verificationTier.upsert({
      where: { code: tier.code },
      update: {
        name: tier.name,
        description: tier.description,
        features: tier.features,
      },
      create: tier,
    });
  }

  for (const plan of monitoringPlans) {
    await prismaClient.monitoringPlan.upsert({
      where: { code: plan.code },
      update: {
        name: plan.name,
        description: plan.description,
      },
      create: plan,
    });
  }

  if (!activePricingSettings && initialRate) {
    await prismaClient.pricingSettings.create({
      data: {
        version: (latestPricingSettings?.version ?? 0) + 1,
        usdToNgnRate: initialRate,
        roundingRule: NgnRoundingRule.NEAREST_KOBO,
        active: true,
        updatedById: admin.id,
      },
    });
    logger.info("Initial USD to NGN pricing settings seeded from environment");
  } else {
    if (process.env.INITIAL_USD_TO_NGN_RATE && activePricingSettings) {
      logger.warn(
        `Ignoring INITIAL_USD_TO_NGN_RATE because an active pricing configuration already exists; admin-managed pricing remains unchanged version=${activePricingSettings.version}`,
      );
    }
    logger.info(
      `Existing active USD to NGN rate preserved version=${activePricingSettings?.version}`,
    );
  }

  logger.info("Verification services, types, and plans seeded successfully");
}

seed()
  .catch((error) => {
    logger.error(`Seed failed: ${error}`);
    process.exit(1);
  })
  .finally(async () => {
    await prismaClient.$disconnect();
  });
