import { MonitoringInterval, PaymentProvider, ProviderPriceSyncStatus } from "@prisma/client";
import {
  activateProviderPriceVersions,
  ActivateProviderPriceVersionsData,
  findPricingTargetForProviderSync,
  ProviderPriceTarget,
  ProviderPriceVersionSpec,
  reserveProviderPriceVersions,
  updateProviderPriceVersionSync,
} from "./database/pricing";
import { syncPaystackPlan } from "../../libs/paystack/paystack";
import { syncStripePrice } from "../../libs/stripe/stripe";
import { logger } from "../../utils/logger";

export interface SyncProviderPriceInput {
  target: ProviderPriceTarget;
  usdAmountCents: number;
  ngnAmountKobo: number;
  monitoringTerms?: {
    code: MonitoringInterval;
    intervalCount: number;
    checksPerPeriod: number;
    reportsPerPeriod: number;
  };
}

const isPositiveSafeInteger = (value: number) => Number.isSafeInteger(value) && value > 0;

const markerPart = (value: string) => value.toLowerCase().replace(/[^a-z0-9_]/g, "_");

const recurringProviderIntervals = (interval: MonitoringInterval) => {
  switch (interval) {
    case MonitoringInterval.WEEKLY:
      return {
        stripeInterval: "week" as const,
        stripeIntervalCount: 1,
        paystackInterval: "weekly" as const,
      };
    case MonitoringInterval.MONTHLY:
      return {
        stripeInterval: "month" as const,
        stripeIntervalCount: 1,
        paystackInterval: "monthly" as const,
      };
    case MonitoringInterval.QUARTERLY:
      return {
        stripeInterval: "month" as const,
        stripeIntervalCount: 3,
        paystackInterval: "quarterly" as const,
      };
  }
};

const expectedMonitoringIntervalCount = (interval: MonitoringInterval) =>
  interval === MonitoringInterval.QUARTERLY ? 3 : 1;

export const syncProviderPrices = async (
  input: SyncProviderPriceInput,
  options: { activate?: boolean } = {},
) => {
  const { target } = input;
  try {
    if (
      !isPositiveSafeInteger(input.usdAmountCents) ||
      !isPositiveSafeInteger(input.ngnAmountKobo)
    ) {
      throw new Error("USD and NGN provider price amounts must be positive safe integers");
    }

    const targetRecord = await findPricingTargetForProviderSync(target);
    const kind = targetRecord.kind;
    const targetId = targetRecord.item.id;
    const targetName = targetRecord.item.name;
    const targetDescription = targetRecord.item.description ?? undefined;
    const terms =
      targetRecord.kind === "monitoring"
        ? (input.monitoringTerms ?? {
            code: targetRecord.item.code,
            intervalCount: targetRecord.item.intervalCount,
            checksPerPeriod: targetRecord.item.checksPerPeriod,
            reportsPerPeriod: targetRecord.item.reportsPerPeriod,
          })
        : undefined;

    if (
      terms &&
      (!Object.values(MonitoringInterval).includes(terms.code) ||
        !isPositiveSafeInteger(terms.intervalCount) ||
        !isPositiveSafeInteger(terms.checksPerPeriod) ||
        !isPositiveSafeInteger(terms.reportsPerPeriod) ||
        terms.intervalCount !== expectedMonitoringIntervalCount(terms.code))
    ) {
      throw new Error("Monitoring interval and included service counts are invalid");
    }

    const providerProductId = `bonafide_${kind}_${markerPart(targetId)}`;
    const interval = terms?.code ?? null;
    const intervalCount = terms?.intervalCount ?? null;
    const prices: ProviderPriceVersionSpec[] = [
      {
        provider: PaymentProvider.STRIPE,
        currency: "USD",
        amountMinor: input.usdAmountCents,
        usdAmountCents: input.usdAmountCents,
        providerProductId,
        interval,
        intervalCount,
      },
      {
        provider: PaymentProvider.PAYSTACK,
        currency: "NGN",
        amountMinor: input.ngnAmountKobo,
        usdAmountCents: input.usdAmountCents,
        interval,
        intervalCount,
      },
    ];
    const reserved = await reserveProviderPriceVersions(target, prices);
    const version = reserved[0]?.version;
    if (
      !version ||
      reserved.length !== prices.length ||
      reserved.some((price) => price.version !== version)
    ) {
      throw new Error("Provider price version reservation did not return all providers");
    }

    const recurring = terms ? recurringProviderIntervals(terms.code) : undefined;
    for (const priceVersion of reserved) {
      try {
        if (priceVersion.provider === PaymentProvider.STRIPE) {
          const marker = `bonafide:${kind}:${targetId}:v${version}:USD`;
          const stripePrice = await syncStripePrice({
            productId: providerProductId,
            productName: `${targetName} - Bonafide ${kind}`,
            productDescription: targetDescription,
            productMarker: `bonafide:${kind}:${targetId}`,
            lookupKey: `${markerPart(providerProductId)}_v${version}_usd`,
            idempotencyKey: `${marker}:stripe`,
            marker,
            amountMinor: input.usdAmountCents,
            currency: "USD",
            ...(recurring
              ? {
                  recurring: {
                    interval: recurring.stripeInterval,
                    intervalCount: recurring.stripeIntervalCount,
                  },
                }
              : {}),
          });
          await updateProviderPriceVersionSync(priceVersion.id, {
            syncStatus: ProviderPriceSyncStatus.READY,
            providerProductId: stripePrice.productId,
            providerPriceId: stripePrice.priceId,
          });
        } else if (terms && recurring) {
          const marker = `bonafide:${kind}:${targetId}:v${version}:NGN`;
          const paystackPlan = await syncPaystackPlan({
            name: `${targetName} - Bonafide ${terms.code.toLowerCase()}`,
            amount: input.ngnAmountKobo,
            interval: recurring.paystackInterval,
            description: marker,
          });
          await updateProviderPriceVersionSync(priceVersion.id, {
            syncStatus: ProviderPriceSyncStatus.READY,
            providerPriceId: paystackPlan.planCode,
          });
        } else {
          await updateProviderPriceVersionSync(priceVersion.id, {
            syncStatus: ProviderPriceSyncStatus.READY,
            providerPriceId: null,
          });
        }
      } catch (error) {
        const syncError =
          error instanceof Error ? error.message.slice(0, 1000) : "Provider sync failed";
        if (priceVersion.activeForNewCheckout) {
          throw error;
        }
        await updateProviderPriceVersionSync(priceVersion.id, {
          syncStatus: ProviderPriceSyncStatus.FAILED,
          syncError,
        });
        throw error;
      }
    }

    const activationData: ActivateProviderPriceVersionsData = {
      target,
      version,
      usdAmountCents: input.usdAmountCents,
      prices,
      ...(terms ? { monitoringTerms: terms } : {}),
    };
    const activated =
      options.activate === false ? reserved : await activateProviderPriceVersions(activationData);
    logger.info(`Provider price sync complete target=${JSON.stringify(target)} version=${version}`);
    return { version, providerPriceVersions: activated, activationData };
  } catch (error) {
    logger.error(`Provider price sync failed target=${JSON.stringify(target)} ${error}`);
    throw error;
  }
};
