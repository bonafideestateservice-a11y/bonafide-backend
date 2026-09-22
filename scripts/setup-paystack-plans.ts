import dotenv from "dotenv";
import { Paystack } from "@paystack/paystack-sdk";
import { VERIFICATION_FREQUENCY } from "@prisma/client";
import { prismaClient } from "../src/utils/prisma";
import { logger } from "../src/utils/logger";

dotenv.config({ path: "./src/.env" });

const paystack = new Paystack(process.env.PAYSTACK_SECRET_KEY);

const intervalByFrequency: Partial<Record<VERIFICATION_FREQUENCY, string>> = {
  [VERIFICATION_FREQUENCY.MONTHLY]: "monthly",
  [VERIFICATION_FREQUENCY.QUARTERLY]: "quarterly",
};

async function listAllPaystackPlans() {
  const plans: Array<{ code: string; description?: string }> = [];
  let page = 1;

  while (true) {
    const response = await paystack.plan.list({ perPage: 100, page });

    if (response.status === false) {
      throw new Error(response.message || "Failed to list Paystack plans");
    }

    const pagePlans = response.data as Array<{ code: string; description?: string }>;
    plans.push(...pagePlans);

    if (pagePlans.length < 100) break;
    page += 1;
  }

  return plans;
}

async function setupPaystackPlans() {
  if (!process.env.PAYSTACK_SECRET_KEY) {
    throw new Error("PAYSTACK_SECRET_KEY is required");
  }

  const verificationPlans = await prismaClient.verificationPlan.findMany({
    include: { verificationType: true },
    orderBy: [{ verificationType: { slug: "asc" } }, { frequency: "asc" }],
  });
  const existingPlans = await listAllPaystackPlans();
  const existingDescriptions = new Set(
    existingPlans.map((plan) => plan.description).filter(Boolean),
  );

  for (const verificationPlan of verificationPlans) {
    const interval = intervalByFrequency[verificationPlan.frequency];

    if (!interval) {
      logger.info(
        `Skipping ${verificationPlan.verificationType.slug}/${verificationPlan.frequency}: Paystack subscriptions are recurring only`,
      );
      continue;
    }

    const marker = `verification_plan_id=${verificationPlan.id}`;
    if (existingDescriptions.has(marker)) {
      logger.info(`Paystack plan already exists for ${verificationPlan.id}`);
      continue;
    }

    const response = await paystack.plan.create({
      name: `${verificationPlan.verificationType.name} - ${verificationPlan.name}`,
      amount: verificationPlan.priceInCents,
      interval,
      currency: verificationPlan.currency,
      description: marker,
      send_invoices: false,
      send_sms: false,
    });

    if (response.status === false) {
      throw new Error(
        `Failed to create Paystack plan for ${verificationPlan.id}: ${response.message}`,
      );
    }

    logger.info(
      `Created Paystack plan ${response.data?.plan_code || ""} for ${verificationPlan.id}`,
    );

    await prismaClient.verificationPlan.update({
      where: { id: verificationPlan.id },
      data: { paystackPlanCode: response.data.plan_code },
    });
  }
}

setupPaystackPlans()
  .catch((error) => {
    logger.error(`Paystack plan setup failed: ${error}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prismaClient.$disconnect();
  });
