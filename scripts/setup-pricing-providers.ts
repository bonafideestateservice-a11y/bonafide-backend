import dotenv from "dotenv";
import path from "path";
import { PaymentProvider } from "@prisma/client";
import { prismaClient } from "../src/utils/prisma";
import { syncProviderPrices } from "../src/api/services/provider-price-sync";
import { usdCentsToNgnKobo } from "../src/api/services/pricing-calculation";
import { logger } from "../src/utils/logger";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const assertSafeActiveProviderState = async ({
  target,
  usdAmountCents,
  ngnAmountKobo,
  monitoringTerms,
}: {
  target: { verificationTierId?: string; monitoringPlanId?: string };
  usdAmountCents: number;
  ngnAmountKobo: number;
  monitoringTerms?: {
    code: string;
    intervalCount: number;
  };
}) => {
  const activeVersions = await prismaClient.providerPriceVersion.findMany({
    where: {
      ...target,
      activeForNewCheckout: true,
    },
    orderBy: { version: "desc" },
  });

  for (const version of activeVersions) {
    if (version.provider === PaymentProvider.STRIPE && version.currency === "USD") {
      if (version.usdAmountCents !== usdAmountCents) {
        throw new Error(
          `Active Stripe provider price for ${JSON.stringify(target)} is ${version.usdAmountCents} cents but local catalog expects ${usdAmountCents} cents. Refusing to overwrite managed state.`,
        );
      }
      if (monitoringTerms && (version.interval !== monitoringTerms.code || version.intervalCount !== monitoringTerms.intervalCount)) {
        throw new Error(
          `Active Stripe provider price for ${JSON.stringify(target)} has interval ${version.interval}/${version.intervalCount}, but local catalog expects ${monitoringTerms.code}/${monitoringTerms.intervalCount}. Refusing to overwrite managed state.`,
        );
      }
    }

    if (version.provider === PaymentProvider.PAYSTACK && version.currency === "NGN") {
      if (version.amountMinor !== ngnAmountKobo) {
        throw new Error(
          `Active Paystack provider price for ${JSON.stringify(target)} is ${version.amountMinor} kobo but local catalog expects ${ngnAmountKobo} kobo. Refusing to overwrite managed state.`,
        );
      }
      if (monitoringTerms && (version.interval !== monitoringTerms.code || version.intervalCount !== monitoringTerms.intervalCount)) {
        throw new Error(
          `Active Paystack provider price for ${JSON.stringify(target)} has interval ${version.interval}/${version.intervalCount}, but local catalog expects ${monitoringTerms.code}/${monitoringTerms.intervalCount}. Refusing to overwrite managed state.`,
        );
      }
    }
  }
};

export async function setupPricingProviders() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is required to synchronize provider prices");
  }
  if (!process.env.PAYSTACK_SECRET_KEY) {
    throw new Error("PAYSTACK_SECRET_KEY is required to synchronize provider prices");
  }

  const pricingSettings = await prismaClient.pricingSettings.findFirst({
    where: { active: true },
    orderBy: { version: "desc" },
  });
  if (!pricingSettings) {
    throw new Error(
      "An active USD to NGN rate is required; set INITIAL_USD_TO_NGN_RATE and run the seed first",
    );
  }

  const [tiers, monitoringPlans] = await Promise.all([
    prismaClient.verificationTier.findMany({
      where: { active: true, quoteRequired: false },
      orderBy: { code: "asc" },
    }),
    prismaClient.monitoringPlan.findMany({
      where: { active: true },
      orderBy: { code: "asc" },
    }),
  ]);
  if (!tiers.length || !monitoringPlans.length) {
    throw new Error("No active fixed tiers or monitoring plans are available to synchronize");
  }

  for (const tier of tiers) {
    if (tier.priceUsdCents === null) {
      throw new Error(`Fixed-price tier ${tier.code} has no USD price`);
    }
    const ngnAmountKobo = usdCentsToNgnKobo(tier.priceUsdCents, pricingSettings.usdToNgnRate);
    await assertSafeActiveProviderState({
      target: { verificationTierId: tier.id },
      usdAmountCents: tier.priceUsdCents,
      ngnAmountKobo,
    });
    await syncProviderPrices({
      target: { verificationTierId: tier.id },
      usdAmountCents: tier.priceUsdCents,
      ngnAmountKobo,
    });
  }

  for (const plan of monitoringPlans) {
    const ngnAmountKobo = usdCentsToNgnKobo(plan.priceUsdCents, pricingSettings.usdToNgnRate);
    const monitoringTerms = {
      code: plan.code,
      intervalCount: plan.intervalCount,
      checksPerPeriod: plan.checksPerPeriod,
      reportsPerPeriod: plan.reportsPerPeriod,
    };
    await assertSafeActiveProviderState({
      target: { monitoringPlanId: plan.id },
      usdAmountCents: plan.priceUsdCents,
      ngnAmountKobo,
      monitoringTerms: { code: plan.code, intervalCount: plan.intervalCount },
    });
    await syncProviderPrices({
      target: { monitoringPlanId: plan.id },
      usdAmountCents: plan.priceUsdCents,
      ngnAmountKobo,
      monitoringTerms,
    });
  }

  logger.info(
    `Provider price setup complete tiers=${tiers.length} monitoringPlans=${monitoringPlans.length} fxVersion=${pricingSettings.version}`,
  );
}

export async function main() {
  try {
    await setupPricingProviders();
  } catch (error) {
    logger.error(`Provider price setup failed: ${error}`);
    process.exitCode = 1;
  } finally {
    await prismaClient.$disconnect();
  }
}

if (require.main === module) {
  void main();
}
