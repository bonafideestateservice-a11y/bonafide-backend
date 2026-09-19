import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../src/.env") });

import { ROLE, VERIFICATION_FREQUENCY } from "@prisma/client";
import { prismaClient } from "../src/utils/prisma";
import { hashPassword } from "../src/utils/password";
import { logger } from "../src/utils/logger";

const ADMIN_EMAIL = process.env.ADMIN_SEED_EMAIL || "admin@bonafide.com";
const ADMIN_PASSWORD = process.env.ADMIN_SEED_PASSWORD || "Admin@123";
const ADMIN_NAME = process.env.ADMIN_SEED_NAME || "Super Admin";

const verificationTypes = [
  {
    slug: "property-verification",
    name: "Property Verification",
    description: "Verify ownership, condition and legal standing",
    icon: "property",
    checklist: [
      { label: "Property structure verified", requiresMedia: true },
      { label: "Property Deed", requiresMedia: true },
      { label: "Survey Plan", requiresMedia: true },
    ],
    plans: [
      {
        frequency: VERIFICATION_FREQUENCY.ONE_TIME,
        name: "One time verification",
        description: "A single inspection with a full report",
        priceInCents: 4500,
        currency: "USD",
      },
      {
        frequency: VERIFICATION_FREQUENCY.MONTHLY,
        name: "Monthly Update",
        description: "Detailed report every month",
        priceInCents: 3500,
        currency: "USD",
      },
      {
        frequency: VERIFICATION_FREQUENCY.QUARTERLY,
        name: "Quarterly Update",
        description: "Detailed report every 3 months",
        priceInCents: 3500,
        currency: "USD",
      },
    ],
  },
  {
    slug: "construction-progress",
    name: "Construction Progress",
    description: "Track milestones with photo, videos, & agent report",
    icon: "construction",
    checklist: [
      { label: "Land documentation verified", requiresMedia: true },
      { label: "Foundation inspected", requiresMedia: true },
      { label: "Construction stage confirmed", requiresMedia: true },
    ],
    plans: [
      {
        frequency: VERIFICATION_FREQUENCY.ONE_TIME,
        name: "One time verification",
        description: "A single inspection with a full report",
        priceInCents: 4500,
        currency: "USD",
      },
      {
        frequency: VERIFICATION_FREQUENCY.MONTHLY,
        name: "Monthly Update",
        description: "Detailed report every month",
        priceInCents: 3500,
        currency: "USD",
      },
      {
        frequency: VERIFICATION_FREQUENCY.QUARTERLY,
        name: "Quarterly Update",
        description: "Detailed report every 3 months",
        priceInCents: 3500,
        currency: "USD",
      },
    ],
  },
  {
    slug: "business-verification",
    name: "Business Verification",
    description: "Confirm business legitimacy, operations & ownership",
    icon: "business",
    checklist: [
      { label: "Business registration verified", requiresMedia: true },
      { label: "Business premises inspected", requiresMedia: true },
      { label: "Business operations confirmed", requiresMedia: true },
    ],
    plans: [
      {
        frequency: VERIFICATION_FREQUENCY.ONE_TIME,
        name: "One time verification",
        description: "A single inspection with a full report",
        priceInCents: 4500,
        currency: "USD",
      },
      {
        frequency: VERIFICATION_FREQUENCY.MONTHLY,
        name: "Monthly Update",
        description: "Detailed report every month",
        priceInCents: 3500,
        currency: "USD",
      },
      {
        frequency: VERIFICATION_FREQUENCY.QUARTERLY,
        name: "Quarterly Update",
        description: "Detailed report every 3 months",
        priceInCents: 3500,
        currency: "USD",
      },
    ],
  },
] as const;

async function seed() {
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
          priceInCents: plan.priceInCents,
          currency: plan.currency,
        },
        create: {
          verificationTypeId: verificationType.id,
          frequency: plan.frequency,
          name: plan.name,
          description: plan.description,
          priceInCents: plan.priceInCents,
          currency: plan.currency,
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
