import dotenv from "dotenv";
import Stripe from "stripe";
import { VERIFICATION_FREQUENCY } from "@prisma/client";
import { prismaClient } from "../src/utils/prisma";
import { logger } from "../src/utils/logger";

dotenv.config({ path: "./src/.env" });

let stripeClient: Stripe | null = null;

function stripe(): Stripe {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is required");
    stripeClient = new Stripe(key);
  }
  return stripeClient;
}

async function ensureStripeProduct(
  id: string,
  params: { name: string; description?: string },
): Promise<Stripe.Product> {
  try {
    return await stripe().products.create({
      id,
      name: params.name,
      ...(params.description ? { description: params.description } : {}),
    });
  } catch (error) {
    if (
      error instanceof Stripe.errors.StripeInvalidRequestError &&
      error.code === "resource_already_exists"
    ) {
      const product = await stripe().products.retrieve(id);
      if ("deleted" in product) throw new Error(`Stripe product ${id} has been deleted`);
      return product;
    }
    throw error;
  }
}

async function ensureStripePrice(params: {
  productId: string;
  lookupKey: string;
  unitAmount: number;
  currency: string;
  frequency: VERIFICATION_FREQUENCY;
}): Promise<Stripe.Price> {
  const existing = await stripe().prices.list({ lookup_keys: [params.lookupKey], limit: 1 });
  if (existing.data[0]) return existing.data[0];

  const recurring =
    params.frequency === VERIFICATION_FREQUENCY.MONTHLY
      ? { interval: "month" as const, interval_count: 1 }
      : params.frequency === VERIFICATION_FREQUENCY.QUARTERLY
        ? { interval: "month" as const, interval_count: 3 }
        : undefined;

  return stripe().prices.create({
    product: params.productId,
    unit_amount: params.unitAmount,
    currency: params.currency.toLowerCase(),
    lookup_key: params.lookupKey,
    ...(recurring ? { recurring } : {}),
  });
}

async function setupStripeProducts() {
  const verificationPlans = await prismaClient.verificationPlan.findMany({
    include: { verificationType: true },
    orderBy: [{ verificationType: { slug: "asc" } }, { frequency: "asc" }],
  });

  for (const verificationPlan of verificationPlans) {
    const verificationType = verificationPlan.verificationType;
    const productId = `bonafide_${verificationType.slug.replace(/[^a-zA-Z0-9_]/g, "_")}`;
    const product = await ensureStripeProduct(productId, {
      name: verificationType.name,
      description: verificationType.description || undefined,
    });
    const lookupKey = `bonafide_${verificationType.slug}_${verificationPlan.frequency.toLowerCase()}`;
    const price = await ensureStripePrice({
      productId: product.id,
      lookupKey,
      unitAmount: verificationPlan.priceInCents,
      currency: verificationPlan.currency,
      frequency: verificationPlan.frequency,
    });

    if (verificationPlan.stripePriceId !== price.id) {
      await prismaClient.verificationPlan.update({
        where: { id: verificationPlan.id },
        data: { stripePriceId: price.id },
      });
    }

    logger.info(
      `Stripe product/price ready verificationPlanId=${verificationPlan.id} productId=${product.id} priceId=${price.id}`,
    );
  }
}

setupStripeProducts()
  .catch((error) => {
    logger.error(`Stripe product setup failed: ${error}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prismaClient.$disconnect();
  });
