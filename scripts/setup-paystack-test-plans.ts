import dotenv from "dotenv";
import { VERIFICATION_FREQUENCY } from "@prisma/client";
import {
  createPaystackPlan,
  listPaystackPlans,
  paystackPriceOf,
} from "../src/libs/paystack/paystack";
import { prismaClient } from "../src/utils/prisma";
import { logger } from "../src/utils/logger";

dotenv.config({ path: "./src/.env" });

/**
 * TEST MODE ONLY. The test Paystack account can't take USD, so this creates a naira copy of each
 * recurring plan (USD price × PAYSTACK_TEST_USD_TO_NGN_RATE) and saves its plan code. Live uses
 * USD plans from setup-paystack-plans.ts. Safe to re-run: existing naira plans are reused.
*/

const intervalByFrequency: Partial<Record<VERIFICATION_FREQUENCY, string>> = {
  [VERIFICATION_FREQUENCY.MONTHLY]: "monthly",
  [VERIFICATION_FREQUENCY.QUARTERLY]: "quarterly",
};

async function listAllPaystackPlans() {
  const plans = [];
  for (let page = 1; ; page += 1) {
    const pagePlans = await listPaystackPlans(page, 100);
    plans.push(...pagePlans);
    if (pagePlans.length < 100) return plans;
  }
}

async function setupPaystackTestPlans() {
  if (!process.env.PAYSTACK_SECRET_KEY?.startsWith("sk_test_")) {
    throw new Error("This script only runs with a Paystack test key (sk_test_...).");
  }
  if (!(Number(process.env.PAYSTACK_TEST_USD_TO_NGN_RATE) > 0)) {
    throw new Error("Set PAYSTACK_TEST_USD_TO_NGN_RATE (naira per dollar), e.g. 1600.");
  }

  const verificationPlans = await prismaClient.verificationPlan.findMany({
    include: { verificationType: true },
    orderBy: [{ verificationType: { slug: "asc" } }, { frequency: "asc" }],
  });
  const codeByDescription = new Map(
    (await listAllPaystackPlans()).map((plan) => [plan.description, plan.plan_code]),
  );

  for (const verificationPlan of verificationPlans) {
    const label = `${verificationPlan.verificationType.slug}/${verificationPlan.frequency}`;
    const interval = intervalByFrequency[verificationPlan.frequency];
    if (!interval) {
      logger.info(`Skipping ${label}: one-time plans don't need a Paystack plan`);
      continue;
    }

    const price = paystackPriceOf(verificationPlan);
    const marker = `verification_plan_id=${verificationPlan.id};currency=${price.currency}`;
    let planCode = codeByDescription.get(marker);
    if (planCode) {
      logger.info(`Test plan ${planCode} already exists for ${label}`);
    } else {
      planCode = (
        await createPaystackPlan({
          name: `[TEST ${price.currency}] ${verificationPlan.verificationType.name} - ${verificationPlan.name}`,
          amount: price.amount,
          interval,
          currency: price.currency,
          description: marker,
        })
      ).plan_code;
      logger.info(
        `Created test plan ${planCode} for ${label}: ${price.currency} ${price.amount / 100}`,
      );
    }

    if (verificationPlan.paystackPlanCode !== planCode) {
      await prismaClient.verificationPlan.update({
        where: { id: verificationPlan.id },
        data: { paystackPlanCode: planCode },
      });
    }
  }
}

setupPaystackTestPlans()
  .catch((error) => {
    logger.error(`Paystack test plan setup failed: ${error}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prismaClient.$disconnect();
  });
