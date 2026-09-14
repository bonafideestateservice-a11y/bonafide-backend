import { ROLE } from "@prisma/client";
import { prismaClient } from "../src/utils/prisma";
import { hashPassword } from "../src/utils/password";
import { logger } from "../src/utils/logger";

const ADMIN_EMAIL = process.env.ADMIN_SEED_EMAIL || "admin@bonafide.com";
const ADMIN_PASSWORD = process.env.ADMIN_SEED_PASSWORD || "Admin@123";
const ADMIN_NAME = process.env.ADMIN_SEED_NAME || "Super Admin";

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
}

seed()
  .catch((error) => {
    logger.error(`Seed failed: ${error}`);
    process.exit(1);
  })
  .finally(async () => {
    await prismaClient.$disconnect();
  });