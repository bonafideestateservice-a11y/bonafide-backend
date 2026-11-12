import { isDeepStrictEqual } from "node:util";
import {
  MonitoringInterval,
  MonitoringPlan,
  ProviderPriceVersion,
  NgnRoundingRule,
  PaymentMethod,
  PaymentProvider,
  PaymentStatus,
  PremiumQuote,
  PremiumQuoteStatus,
  Prisma,
  ProviderPriceSyncStatus,
  SubscriptionPeriod,
  SubscriptionPeriodStatus,
  Transaction,
  TransactionPurpose,
  VerificationRequest,
  VerificationStatus,
  VerificationTierCode,
} from "@prisma/client";
import { prismaClient } from "../../../utils/prisma";
import { logger } from "../../../utils/logger";
import { usdCentsToNgnKobo } from "../pricing-calculation";

export class PricingRecordError extends Error {
  constructor(
    public readonly code:
      "NOT_FOUND" | "INVALID_STATE" | "INVALID_SELECTION" | "QUOTE_EXPIRED" | "QUOTE_OUT_OF_RANGE",
    message: string,
  ) {
    super(message);
    this.name = "PricingRecordError";
  }
}

export interface VerificationPricingCatalogue {
  tiers: Awaited<ReturnType<typeof prismaClient.verificationTier.findMany>>;
  monitoringPlans: Awaited<ReturnType<typeof prismaClient.monitoringPlan.findMany>>;
  pricingSettings: Awaited<ReturnType<typeof prismaClient.pricingSettings.findFirst>>;
}

export interface UpdateVerificationRequestPricingData {
  requestId: string;
  userId: string;
  verificationTierId: string;
  monitoringPlanId?: string | null;
  recurringConsent: boolean;
}

export interface IssuePremiumQuoteData {
  quoteId: string;
  issuedById: string;
  scopeSummary: string | null;
  quoteUsdCents: number;
  quoteNgnKobo: number;
  usdToNgnRate: string;
  rateVersion: number;
  pricingSettingsId: string;
  expiresAt: Date;
}

export interface CreatePricedTransactionData {
  verificationRequestId: string;
  amountInCents: number;
  currency: string;
  method: PaymentMethod;
  provider: PaymentProvider;
  purpose: TransactionPurpose;
  verificationTierId?: string;
  providerPriceVersionId?: string;
  premiumQuoteId?: string;
  tierAmountUsdCents: number;
  monitoringAmountUsdCents: number;
  totalUsdCents: number;
  fxRate?: string;
  fxRateVersion?: number;
  fxRoundingRule?: NgnRoundingRule;
  pricingSnapshot: Prisma.InputJsonValue;
}

export interface CreateMonitoringSubscriptionData {
  userId: string;
  verificationRequestId: string;
  monitoringPlanId: string;
  providerPriceVersionId?: string;
  provider: PaymentProvider;
  providerSubscriptionId: string;
  customerCode?: string;
  emailToken?: string;
  consentAt: Date;
  startedAt?: Date;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  terms: Pick<
    MonitoringPlan,
    "version" | "code" | "intervalCount" | "priceUsdCents" | "checksPerPeriod" | "reportsPerPeriod"
  >;
}

export interface CreateSubscriptionPeriodData {
  monitoringSubscriptionId: string;
  paidTransactionId: string;
  periodStart: Date;
  periodEnd: Date;
}

export interface ActivatePaidMonitoringData {
  transactionId: string;
  provider: PaymentProvider;
  providerSubscriptionId: string;
  customerCode?: string;
  emailToken?: string;
  startedAt?: Date;
  periodStart: Date;
  periodEnd: Date;
}

export interface MonitoringRenewalSnapshotData {
  provider: PaymentProvider;
  currency: string;
  planId: string;
  planCode: MonitoringInterval;
  planVersion: number;
  intervalCount: number;
  amountUsdCents: number;
  amountMinor: number;
  checksPerPeriod: number;
  reportsPerPeriod: number;
  providerPriceVersionId: string;
  consentAt: Date;
}

export const createMonitoringRenewalSnapshot = (data: MonitoringRenewalSnapshotData) => ({
  version: 1,
  provider: data.provider,
  currency: data.currency,
  renewal: true,
  verification: {
    tierId: null,
    tierCode: null,
    tierName: null,
    amountUsdCents: 0,
    amountMinor: 0,
    providerPriceVersionId: null,
  },
  monitoring: {
    planId: data.planId,
    planCode: data.planCode,
    planVersion: data.planVersion,
    intervalCount: data.intervalCount,
    amountUsdCents: data.amountUsdCents,
    amountMinor: data.amountMinor,
    checksPerPeriod: data.checksPerPeriod,
    reportsPerPeriod: data.reportsPerPeriod,
    providerPriceVersionId: data.providerPriceVersionId,
    consentAt: data.consentAt.toISOString(),
  },
  total: { usdCents: data.amountUsdCents, amountMinor: data.amountMinor },
  fx: null,
});

export interface CreatePeriodReportData {
  subscriptionPeriodId: string;
  submittedByAgentId: string;
  verificationTierId?: string;
  tierNameSnapshot?: string;
  packageScopeSnapshot?: Prisma.InputJsonValue;
  summary?: string;
  findings?: Prisma.InputJsonValue;
  reportUrl?: string;
  additionalNotes?: string;
}

export interface FindVerificationCheckoutPricingData {
  requestId: string;
  userId: string;
  provider: "STRIPE" | "PAYSTACK";
  now?: Date;
}

export interface ProviderPriceVersionSpec {
  provider: PaymentProvider;
  currency: string;
  amountMinor: number;
  usdAmountCents: number;
  providerProductId?: string | null;
  interval?: MonitoringInterval | null;
  intervalCount?: number | null;
}

export type ProviderPriceTarget = { verificationTierId: string } | { monitoringPlanId: string };

const payableCheckoutStatuses: VerificationStatus[] = [
  VerificationStatus.DRAFT,
  VerificationStatus.PENDING_PAYMENT,
  VerificationStatus.PAYMENT_FAILED,
];

export const findVerificationCheckoutPricing = async (
  data: FindVerificationCheckoutPricingData,
) => {
  try {
    const request = await prismaClient.verificationRequest.findFirst({
      where: { id: data.requestId, userId: data.userId },
      select: {
        id: true,
        userId: true,
        status: true,
        verificationTierId: true,
        verificationTier: {
          select: {
            id: true,
            code: true,
            name: true,
            priceUsdCents: true,
            quoteRequired: true,
            active: true,
          },
        },
        monitoringPlanId: true,
        monitoringPlan: {
          select: {
            id: true,
            code: true,
            name: true,
            priceUsdCents: true,
            intervalCount: true,
            checksPerPeriod: true,
            reportsPerPeriod: true,
            version: true,
            active: true,
          },
        },
        recurringConsent: true,
        recurringConsentAt: true,
        user: { select: { countryCode: true, email: true, paystackCustomerCode: true } },
      },
    });
    if (!request) throw new PricingRecordError("NOT_FOUND", "Verification request not found");
    if (!payableCheckoutStatuses.includes(request.status)) {
      throw new PricingRecordError(
        "INVALID_STATE",
        "This verification request is not available for payment",
      );
    }
    if (!request.verificationTier?.active) {
      throw new PricingRecordError("INVALID_SELECTION", "Verification tier is unavailable");
    }

    const countryCode = request.user.countryCode?.toUpperCase();
    if (!countryCode) {
      throw new PricingRecordError("INVALID_SELECTION", "Set your country before checkout");
    }
    const isNigerian = countryCode === "NG";
    if ((data.provider === PaymentProvider.PAYSTACK) !== isNigerian) {
      throw new PricingRecordError(
        "INVALID_SELECTION",
        "Payment provider does not match the request country",
      );
    }

    const now = data.now ?? new Date();
    const quote = request.verificationTier.quoteRequired
      ? await prismaClient.premiumQuote.findFirst({
          where: {
            verificationRequestId: request.id,
            status: PremiumQuoteStatus.ACCEPTED,
          },
          orderBy: { createdAt: "desc" },
        })
      : null;
    if (request.verificationTier.quoteRequired && !quote) {
      throw new PricingRecordError("INVALID_STATE", "An accepted Premium quote is required");
    }
    if (quote && (!quote.expiresAt || quote.expiresAt <= now)) {
      throw new PricingRecordError("QUOTE_EXPIRED", "The accepted Premium quote has expired");
    }
    if (
      quote &&
      (quote.verificationTierId !== request.verificationTierId ||
        quote.monitoringPlanId !== request.monitoringPlanId ||
        !quote.quoteUsdCents ||
        quote.quoteUsdCents <= 0 ||
        !quote.quoteNgnKobo ||
        quote.quoteNgnKobo <= 0)
    ) {
      throw new PricingRecordError("INVALID_STATE", "The accepted Premium quote is incomplete");
    }
    if (
      !request.verificationTier.quoteRequired &&
      (!request.verificationTier.priceUsdCents || request.verificationTier.priceUsdCents <= 0)
    ) {
      throw new PricingRecordError("INVALID_SELECTION", "Verification tier price is unavailable");
    }

    if (request.monitoringPlanId && !request.monitoringPlan?.active) {
      throw new PricingRecordError("INVALID_SELECTION", "Monitoring plan is unavailable");
    }
    if (request.monitoringPlan && request.verificationTier.code === VerificationTierCode.BASIC) {
      throw new PricingRecordError(
        "INVALID_SELECTION",
        "Basic verification does not include monitoring",
      );
    }
    if (
      request.monitoringPlanId &&
      (!request.recurringConsent || !request.recurringConsentAt || !request.monitoringPlan)
    ) {
      throw new PricingRecordError("INVALID_STATE", "Recurring consent is required for monitoring");
    }
    if (!request.monitoringPlanId && request.recurringConsent) {
      throw new PricingRecordError(
        "INVALID_STATE",
        "Recurring consent cannot be recorded without a monitoring plan",
      );
    }

    const pricingSettings = await prismaClient.pricingSettings.findFirst({
      where: { active: true },
      orderBy: { version: "desc" },
    });
    if (isNigerian && !quote && !pricingSettings) {
      throw new PricingRecordError("INVALID_STATE", "An active NGN pricing rate is required");
    }
    if (request.monitoringPlan && isNigerian && !pricingSettings) {
      throw new PricingRecordError(
        "INVALID_STATE",
        "An active NGN pricing rate is required for monitoring",
      );
    }

    const tierPriceVersion = !quote
      ? await prismaClient.providerPriceVersion.findFirst({
          where: {
            verificationTierId: request.verificationTier.id,
            provider: data.provider,
            currency: isNigerian ? "NGN" : "USD",
            syncStatus: ProviderPriceSyncStatus.READY,
            activeForNewCheckout: true,
          },
          orderBy: { version: "desc" },
        })
      : null;
    if (
      data.provider === PaymentProvider.STRIPE &&
      !quote &&
      (!tierPriceVersion?.providerPriceId ||
        tierPriceVersion.usdAmountCents !== request.verificationTier.priceUsdCents ||
        tierPriceVersion.amountMinor !== request.verificationTier.priceUsdCents)
    ) {
      throw new PricingRecordError(
        "INVALID_SELECTION",
        "Verification tier is not synchronized for Stripe checkout",
      );
    }

    const monitoringPriceVersion = request.monitoringPlan
      ? await prismaClient.providerPriceVersion.findFirst({
          where: {
            monitoringPlanId: request.monitoringPlan.id,
            provider: data.provider,
            currency: isNigerian ? "NGN" : "USD",
            syncStatus: ProviderPriceSyncStatus.READY,
            activeForNewCheckout: true,
          },
          orderBy: { version: "desc" },
        })
      : null;
    if (
      request.monitoringPlan &&
      (!monitoringPriceVersion?.providerPriceId ||
        monitoringPriceVersion.usdAmountCents !== request.monitoringPlan.priceUsdCents ||
        monitoringPriceVersion.interval !== request.monitoringPlan.code ||
        monitoringPriceVersion.intervalCount !== request.monitoringPlan.intervalCount)
    ) {
      throw new PricingRecordError(
        "INVALID_SELECTION",
        "Monitoring plan is not synchronized for the selected provider",
      );
    }

    const verificationAmountUsdCents =
      quote?.quoteUsdCents ?? request.verificationTier.priceUsdCents ?? 0;
    const verificationAmountNgnKobo =
      quote?.quoteNgnKobo ??
      (pricingSettings
        ? usdCentsToNgnKobo(verificationAmountUsdCents, pricingSettings.usdToNgnRate)
        : null);
    const monitoringAmountUsdCents = request.monitoringPlan?.priceUsdCents ?? 0;
    const monitoringAmountNgnKobo =
      request.monitoringPlan && pricingSettings
        ? usdCentsToNgnKobo(monitoringAmountUsdCents, pricingSettings.usdToNgnRate)
        : 0;

    if (
      request.monitoringPlan &&
      isNigerian &&
      monitoringPriceVersion?.amountMinor !== monitoringAmountNgnKobo
    ) {
      throw new PricingRecordError(
        "INVALID_SELECTION",
        "Monitoring provider price does not match the active NGN rate",
      );
    }
    if (isNigerian && verificationAmountNgnKobo === null) {
      throw new PricingRecordError(
        "INVALID_STATE",
        "Verification amount cannot be converted to NGN",
      );
    }
    if (
      data.provider === PaymentProvider.PAYSTACK &&
      !quote &&
      (!tierPriceVersion ||
        tierPriceVersion.providerPriceId !== null ||
        tierPriceVersion.usdAmountCents !== request.verificationTier.priceUsdCents ||
        tierPriceVersion.amountMinor !== verificationAmountNgnKobo)
    ) {
      throw new PricingRecordError(
        "INVALID_SELECTION",
        "Verification tier is not synchronized for Paystack checkout",
      );
    }

    const currency = isNigerian ? "NGN" : "USD";
    const totalUsdCents = verificationAmountUsdCents + monitoringAmountUsdCents;
    const totalNgnKobo = (verificationAmountNgnKobo ?? 0) + monitoringAmountNgnKobo;
    const amountMinor = isNigerian ? totalNgnKobo : totalUsdCents;
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
      throw new PricingRecordError(
        "INVALID_SELECTION",
        "Checkout amount is outside the valid range",
      );
    }

    return {
      request,
      quote,
      pricingSettings,
      tierPriceVersion,
      monitoringPriceVersion,
      provider: data.provider,
      countryCode,
      currency,
      verificationAmountUsdCents,
      verificationAmountNgnKobo,
      monitoringAmountUsdCents,
      monitoringAmountNgnKobo,
      totalUsdCents,
      totalNgnKobo,
      amountMinor,
      providerPriceVersionId: monitoringPriceVersion?.id ?? tierPriceVersion?.id ?? undefined,
    };
  } catch (error) {
    logger.error(`Error finding checkout pricing requestId=${data.requestId} ${error}`);
    throw error;
  }
};

export type VerificationCheckoutPricing = Awaited<
  ReturnType<typeof findVerificationCheckoutPricing>
>;

export const createVerificationCheckoutTransactionData = (
  pricing: VerificationCheckoutPricing,
): CreatePricedTransactionData => {
  const tier = pricing.request.verificationTier;
  if (!tier) {
    throw new PricingRecordError("INVALID_SELECTION", "Verification tier is unavailable");
  }
  const monitoringPlan = pricing.request.monitoringPlan;
  const useCurrentRate = Boolean(monitoringPlan || !pricing.quote);
  const rate = useCurrentRate
    ? (pricing.pricingSettings?.usdToNgnRate ?? pricing.quote?.usdToNgnRate ?? null)
    : (pricing.quote?.usdToNgnRate ?? null);
  const rateVersion = useCurrentRate
    ? (pricing.pricingSettings?.version ?? pricing.quote?.rateVersion ?? undefined)
    : (pricing.quote?.rateVersion ?? undefined);
  const roundingRule = useCurrentRate
    ? (pricing.pricingSettings?.roundingRule ?? pricing.quote?.roundingRule ?? undefined)
    : (pricing.quote?.roundingRule ?? undefined);

  return {
    verificationRequestId: pricing.request.id,
    amountInCents: pricing.amountMinor,
    currency: pricing.currency,
    method: PaymentMethod.CARD,
    provider: pricing.provider,
    purpose: pricing.quote ? TransactionPurpose.PREMIUM_QUOTE : TransactionPurpose.INITIAL_PURCHASE,
    verificationTierId: tier.id,
    providerPriceVersionId: pricing.providerPriceVersionId,
    premiumQuoteId: pricing.quote?.id,
    tierAmountUsdCents: pricing.verificationAmountUsdCents,
    monitoringAmountUsdCents: pricing.monitoringAmountUsdCents,
    totalUsdCents: pricing.totalUsdCents,
    fxRate: rate?.toString(),
    fxRateVersion: rateVersion,
    fxRoundingRule: roundingRule,
    pricingSnapshot: {
      version: 1,
      provider: pricing.provider,
      currency: pricing.currency,
      verification: {
        tierId: tier.id,
        tierCode: tier.code,
        tierName: tier.name,
        amountUsdCents: pricing.verificationAmountUsdCents,
        amountMinor:
          pricing.currency === "NGN"
            ? pricing.verificationAmountNgnKobo
            : pricing.verificationAmountUsdCents,
        ...(pricing.quote
          ? {
              quoteId: pricing.quote.id,
              quoteExpiresAt: pricing.quote.expiresAt?.toISOString() ?? null,
              quoteRate: pricing.quote.usdToNgnRate?.toString() ?? null,
              quoteRateVersion: pricing.quote.rateVersion,
            }
          : {}),
        providerPriceVersionId: pricing.tierPriceVersion?.id ?? null,
      },
      monitoring: monitoringPlan
        ? {
            planId: monitoringPlan.id,
            planCode: monitoringPlan.code,
            planName: monitoringPlan.name,
            planVersion: monitoringPlan.version,
            intervalCount: monitoringPlan.intervalCount,
            checksPerPeriod: monitoringPlan.checksPerPeriod,
            reportsPerPeriod: monitoringPlan.reportsPerPeriod,
            amountUsdCents: pricing.monitoringAmountUsdCents,
            amountMinor:
              pricing.currency === "NGN"
                ? pricing.monitoringAmountNgnKobo
                : pricing.monitoringAmountUsdCents,
            providerPriceVersionId: pricing.monitoringPriceVersion?.id ?? null,
            consentAt: pricing.request.recurringConsentAt?.toISOString() ?? null,
          }
        : null,
      total: {
        usdCents: pricing.totalUsdCents,
        ngnKobo: pricing.totalNgnKobo,
        amountMinor: pricing.amountMinor,
      },
      fx: rate
        ? {
            rate: rate.toString(),
            version: rateVersion ?? null,
            roundingRule: roundingRule ?? null,
          }
        : null,
    },
  };
};

export interface ActivateProviderPriceVersionsData {
  target: ProviderPriceTarget;
  version: number;
  usdAmountCents: number;
  prices: ProviderPriceVersionSpec[];
  monitoringTerms?: Pick<
    MonitoringPlan,
    "code" | "intervalCount" | "checksPerPeriod" | "reportsPerPeriod"
  >;
}

export interface ActivateProviderPriceVersionsBatchData {
  activations: ActivateProviderPriceVersionsData[];
  quoteRanges?: {
    id: string;
    minQuoteUsdCents: number;
    maxQuoteUsdCents: number;
  }[];
  pricingSettings?: {
    usdToNgnRate: Prisma.Decimal;
    updatedById: string;
  };
}

export const getVerificationPricingCatalogue = async (): Promise<VerificationPricingCatalogue> => {
  try {
    const [tiers, monitoringPlans, pricingSettings] = await Promise.all([
      prismaClient.verificationTier.findMany({
        where: { active: true },
        orderBy: { code: "asc" },
      }),
      prismaClient.monitoringPlan.findMany({
        where: { active: true },
        orderBy: { code: "asc" },
      }),
      prismaClient.pricingSettings.findFirst({
        where: { active: true },
        orderBy: { version: "desc" },
      }),
    ]);
    logger.info(
      `Pricing catalogue fetched tiers=${tiers.length} monitoringPlans=${monitoringPlans.length} fxVersion=${pricingSettings?.version ?? "unset"}`,
    );
    return { tiers, monitoringPlans, pricingSettings };
  } catch (error) {
    logger.error(`Error fetching verification pricing catalogue ${error}`);
    throw error;
  }
};

export const findActiveProviderPriceVersion = async (
  where:
    | { verificationTierId: string }
    | { monitoringPlanId: string }
    | { legacyVerificationPlanId: string },
  provider: PaymentProvider,
  currency: string,
) => {
  try {
    const priceVersion = await prismaClient.providerPriceVersion.findFirst({
      where: {
        ...where,
        provider,
        currency,
        syncStatus: ProviderPriceSyncStatus.READY,
        activeForNewCheckout: true,
      },
      orderBy: { version: "desc" },
    });
    logger.info(
      `Provider price lookup provider=${provider} currency=${currency} found=${!!priceVersion}`,
    );
    return priceVersion;
  } catch (error) {
    logger.error(`Error finding active provider price version ${error}`);
    throw error;
  }
};

export const findPricingTargetForProviderSync = async (target: ProviderPriceTarget) => {
  try {
    if ("verificationTierId" in target) {
      const tier = await prismaClient.verificationTier.findUnique({
        where: { id: target.verificationTierId },
      });
      if (!tier || !tier.active || tier.quoteRequired || tier.priceUsdCents === null) {
        throw new PricingRecordError(
          "INVALID_SELECTION",
          "Fixed-price verification tier not found",
        );
      }
      return { kind: "tier" as const, item: tier };
    }

    const plan = await prismaClient.monitoringPlan.findUnique({
      where: { id: target.monitoringPlanId },
    });
    if (!plan || !plan.active) {
      throw new PricingRecordError("INVALID_SELECTION", "Active monitoring plan not found");
    }
    return { kind: "monitoring" as const, item: plan };
  } catch (error) {
    logger.error(`Error finding pricing target for provider sync ${error}`);
    throw error;
  }
};

const sameProviderPrice = (record: ProviderPriceVersion, spec: ProviderPriceVersionSpec) =>
  record.provider === spec.provider &&
  record.currency === spec.currency &&
  record.amountMinor === spec.amountMinor &&
  record.usdAmountCents === spec.usdAmountCents &&
  record.providerProductId === (spec.providerProductId ?? null) &&
  record.interval === (spec.interval ?? null) &&
  record.intervalCount === (spec.intervalCount ?? null);

export const reserveProviderPriceVersions = async (
  target: ProviderPriceTarget,
  prices: ProviderPriceVersionSpec[],
): Promise<ProviderPriceVersion[]> => {
  try {
    if (!prices.length) {
      throw new PricingRecordError("INVALID_SELECTION", "At least one provider price is required");
    }
    const versions = await prismaClient.$transaction(async (tx) => {
      const existing = await tx.providerPriceVersion.findMany({
        where: target,
        orderBy: { version: "desc" },
      });
      const expectedPairs = new Set(prices.map((price) => `${price.provider}:${price.currency}`));
      if (expectedPairs.size !== prices.length) {
        throw new PricingRecordError("INVALID_SELECTION", "Provider price entries must be unique");
      }

      const candidateVersions = [...new Set(existing.map((record) => record.version))];
      let version: number | undefined;
      for (const candidate of candidateVersions) {
        const rows = existing.filter((record) => record.version === candidate);
        const matchingRows = rows.every((record) => {
          const spec = prices.find(
            (price) => price.provider === record.provider && price.currency === record.currency,
          );
          return !!spec && sameProviderPrice(record, spec);
        });
        if (matchingRows && rows.length <= prices.length) {
          version = candidate;
          break;
        }
      }
      version ??= (candidateVersions[0] ?? 0) + 1;

      const rowsAtVersion = existing.filter((record) => record.version === version);
      const reserved: ProviderPriceVersion[] = [];
      for (const spec of prices) {
        const found = rowsAtVersion.find(
          (record) => record.provider === spec.provider && record.currency === spec.currency,
        );
        if (found) {
          if (!sameProviderPrice(found, spec)) {
            throw new PricingRecordError(
              "INVALID_STATE",
              "A provider price version cannot be reused with different terms",
            );
          }
          if (found.syncStatus === ProviderPriceSyncStatus.FAILED && !found.activeForNewCheckout) {
            reserved.push(
              await tx.providerPriceVersion.update({
                where: { id: found.id },
                data: { syncStatus: ProviderPriceSyncStatus.PENDING, syncError: null },
              }),
            );
          } else {
            reserved.push(found);
          }
          continue;
        }
        reserved.push(
          await tx.providerPriceVersion.create({
            data: {
              ...target,
              ...spec,
              version,
              syncStatus: ProviderPriceSyncStatus.PENDING,
            },
          }),
        );
      }
      return reserved;
    });
    logger.info(
      `Provider price versions reserved target=${JSON.stringify(target)} version=${versions[0]?.version} count=${versions.length}`,
    );
    return versions;
  } catch (error) {
    logger.error(`Error reserving provider price versions ${error}`);
    throw error;
  }
};

export const updateProviderPriceVersionSync = async (
  id: string,
  result:
    | {
        syncStatus: typeof ProviderPriceSyncStatus.READY;
        providerProductId?: string | null;
        providerPriceId?: string | null;
      }
    | { syncStatus: typeof ProviderPriceSyncStatus.FAILED; syncError: string },
): Promise<ProviderPriceVersion> => {
  try {
    const current = await prismaClient.providerPriceVersion.findUnique({ where: { id } });
    if (!current) throw new PricingRecordError("NOT_FOUND", "Provider price version not found");
    if (current.activeForNewCheckout && result.syncStatus !== ProviderPriceSyncStatus.READY) {
      throw new PricingRecordError(
        "INVALID_STATE",
        "An active provider price cannot be marked failed",
      );
    }
    if (
      result.syncStatus === ProviderPriceSyncStatus.READY &&
      current.syncStatus === ProviderPriceSyncStatus.READY &&
      (current.providerPriceId !== (result.providerPriceId ?? null) ||
        current.providerProductId !== (result.providerProductId ?? null))
    ) {
      throw new PricingRecordError("INVALID_STATE", "A ready provider price version is immutable");
    }
    const updated = await prismaClient.providerPriceVersion.update({
      where: { id },
      data:
        result.syncStatus === ProviderPriceSyncStatus.READY
          ? {
              syncStatus: result.syncStatus,
              syncError: null,
              providerProductId: result.providerProductId ?? null,
              providerPriceId: result.providerPriceId ?? null,
            }
          : { syncStatus: result.syncStatus, syncError: result.syncError },
    });
    logger.info(`Provider price sync updated versionId=${id} status=${result.syncStatus}`);
    return updated;
  } catch (error) {
    logger.error(`Error updating provider price sync versionId=${id} ${error}`);
    throw error;
  }
};

export const activateProviderPriceVersionsBatch = async (
  data: ActivateProviderPriceVersionsBatchData,
): Promise<ProviderPriceVersion[]> => {
  try {
    const activeVersions = await prismaClient.$transaction(
      async (tx) => {
        const activatedIds: string[] = [];
        const seenTargets = new Set<string>();

        for (const activation of data.activations) {
          const targetKey =
            "verificationTierId" in activation.target
              ? `tier:${activation.target.verificationTierId}`
              : `monitoring:${activation.target.monitoringPlanId}`;
          if (seenTargets.has(targetKey)) {
            throw new PricingRecordError(
              "INVALID_SELECTION",
              "A pricing target can only be activated once per update",
            );
          }
          seenTargets.add(targetKey);

          const records = await tx.providerPriceVersion.findMany({
            where: { ...activation.target, version: activation.version },
          });
          if (records.length !== activation.prices.length) {
            throw new PricingRecordError(
              "INVALID_STATE",
              "Required provider prices are not all synced",
            );
          }
          for (const spec of activation.prices) {
            const record = records.find(
              (candidate) =>
                candidate.provider === spec.provider && candidate.currency === spec.currency,
            );
            const providerReferencesExist =
              record?.provider === PaymentProvider.STRIPE
                ? !!record.providerProductId && !!record.providerPriceId
                : record?.provider === PaymentProvider.PAYSTACK
                  ? spec.interval
                    ? !!record.providerPriceId
                    : record.providerPriceId === null
                  : false;
            if (
              !record ||
              record.syncStatus !== ProviderPriceSyncStatus.READY ||
              !sameProviderPrice(record, spec) ||
              !providerReferencesExist
            ) {
              throw new PricingRecordError(
                "INVALID_STATE",
                "Provider price sync is incomplete or does not match the proposed terms",
              );
            }
          }

          if ("verificationTierId" in activation.target) {
            const tier = await tx.verificationTier.findFirst({
              where: {
                id: activation.target.verificationTierId,
                active: true,
                quoteRequired: false,
              },
              select: { id: true },
            });
            if (!tier) {
              throw new PricingRecordError("INVALID_SELECTION", "Fixed-price tier not found");
            }
            await tx.providerPriceVersion.updateMany({
              where: { verificationTierId: tier.id, activeForNewCheckout: true },
              data: { activeForNewCheckout: false },
            });
            await tx.verificationTier.update({
              where: { id: tier.id },
              data: {
                priceUsdCents: activation.usdAmountCents,
                version: activation.version,
              },
            });
          } else {
            const plan = await tx.monitoringPlan.findUnique({
              where: { id: activation.target.monitoringPlanId },
              select: { id: true, active: true },
            });
            if (!plan?.active || !activation.monitoringTerms) {
              throw new PricingRecordError(
                "INVALID_SELECTION",
                "Active monitoring plan terms are required",
              );
            }
            await tx.providerPriceVersion.updateMany({
              where: { monitoringPlanId: plan.id, activeForNewCheckout: true },
              data: { activeForNewCheckout: false },
            });
            await tx.monitoringPlan.update({
              where: { id: plan.id },
              data: {
                priceUsdCents: activation.usdAmountCents,
                version: activation.version,
                ...activation.monitoringTerms,
              },
            });
          }

          for (const record of records) {
            const activated = await tx.providerPriceVersion.update({
              where: { id: record.id },
              data: { activeForNewCheckout: true },
            });
            activatedIds.push(activated.id);
          }
        }

        for (const quoteRange of data.quoteRanges ?? []) {
          const tier = await tx.verificationTier.findFirst({
            where: { id: quoteRange.id, active: true, quoteRequired: true },
            select: { id: true },
          });
          if (!tier) {
            throw new PricingRecordError("INVALID_SELECTION", "Quote-required tier not found");
          }
          await tx.verificationTier.update({
            where: { id: tier.id },
            data: {
              minQuoteUsdCents: quoteRange.minQuoteUsdCents,
              maxQuoteUsdCents: quoteRange.maxQuoteUsdCents,
            },
          });
        }

        if (data.pricingSettings) {
          const latest = await tx.pricingSettings.findFirst({ orderBy: { version: "desc" } });
          await tx.pricingSettings.updateMany({
            where: { active: true },
            data: { active: false },
          });
          await tx.pricingSettings.create({
            data: {
              version: (latest?.version ?? 0) + 1,
              usdToNgnRate: data.pricingSettings.usdToNgnRate,
              roundingRule: NgnRoundingRule.NEAREST_KOBO,
              active: true,
              updatedById: data.pricingSettings.updatedById,
            },
          });
        }

        return activatedIds.length
          ? tx.providerPriceVersion.findMany({ where: { id: { in: activatedIds } } })
          : [];
      },
      { timeout: 30_000 },
    );
    logger.info(`Provider price versions activated count=${activeVersions.length}`);
    return activeVersions;
  } catch (error) {
    logger.error(`Error activating provider price versions ${error}`);
    throw error;
  }
};

export const activateProviderPriceVersions = async (
  data: ActivateProviderPriceVersionsData,
): Promise<ProviderPriceVersion[]> => activateProviderPriceVersionsBatch({ activations: [data] });

export const updateVerificationRequestPricing = async (
  data: UpdateVerificationRequestPricingData,
): Promise<VerificationRequest> => {
  try {
    const request = await prismaClient.$transaction(async (tx) => {
      const [existing, tier] = await Promise.all([
        tx.verificationRequest.findFirst({
          where: {
            id: data.requestId,
            userId: data.userId,
            status: { in: [VerificationStatus.DRAFT, VerificationStatus.QUOTE_REQUIRED] },
          },
          select: { id: true },
        }),
        tx.verificationTier.findFirst({
          where: { id: data.verificationTierId, active: true },
          select: { id: true, code: true, quoteRequired: true },
        }),
      ]);
      if (!existing) throw new PricingRecordError("NOT_FOUND", "Verification request not found");
      if (!tier)
        throw new PricingRecordError("INVALID_SELECTION", "Verification tier is unavailable");

      const monitoringPlan = data.monitoringPlanId
        ? await tx.monitoringPlan.findFirst({
            where: { id: data.monitoringPlanId, active: true },
            select: { id: true },
          })
        : null;
      if (data.monitoringPlanId && !monitoringPlan) {
        throw new PricingRecordError("INVALID_SELECTION", "Monitoring plan is unavailable");
      }
      if (tier.code === VerificationTierCode.BASIC && monitoringPlan) {
        throw new PricingRecordError(
          "INVALID_SELECTION",
          "Basic verification does not support monitoring",
        );
      }
      if (monitoringPlan && !data.recurringConsent) {
        throw new PricingRecordError(
          "INVALID_SELECTION",
          "Recurring consent is required for monitoring",
        );
      }
      if (!monitoringPlan && data.recurringConsent) {
        throw new PricingRecordError(
          "INVALID_SELECTION",
          "Recurring consent cannot be recorded without a monitoring plan",
        );
      }
      if (tier.quoteRequired !== (tier.code === VerificationTierCode.PREMIUM)) {
        throw new PricingRecordError(
          "INVALID_SELECTION",
          "Verification tier quote settings are invalid",
        );
      }

      const existingQuote = await tx.premiumQuote.findFirst({
        where: {
          verificationRequestId: data.requestId,
          status: {
            in: [
              PremiumQuoteStatus.REQUESTED,
              PremiumQuoteStatus.ISSUED,
              PremiumQuoteStatus.ACCEPTED,
            ],
          },
        },
        select: { id: true },
      });
      if (existingQuote) {
        throw new PricingRecordError(
          "INVALID_STATE",
          "Cancel the existing Premium quote before changing request pricing",
        );
      }

      const update = await tx.verificationRequest.updateMany({
        where: {
          id: data.requestId,
          userId: data.userId,
          status: { in: [VerificationStatus.DRAFT, VerificationStatus.QUOTE_REQUIRED] },
        },
        data: {
          verificationTierId: tier.id,
          monitoringPlanId: monitoringPlan?.id ?? null,
          recurringConsent: Boolean(monitoringPlan && data.recurringConsent),
          recurringConsentAt: monitoringPlan && data.recurringConsent ? new Date() : null,
          verificationPlanId: null,
          status: tier.quoteRequired ? VerificationStatus.QUOTE_REQUIRED : VerificationStatus.DRAFT,
        },
      });
      if (update.count !== 1) {
        throw new PricingRecordError("INVALID_STATE", "Verification request pricing has changed");
      }
      return tx.verificationRequest.findUniqueOrThrow({ where: { id: data.requestId } });
    });
    logger.info(
      `Verification request pricing updated requestId=${request.id} tierId=${data.verificationTierId}`,
    );
    return request;
  } catch (error) {
    logger.error(
      `Error updating verification request pricing requestId=${data.requestId} ${error}`,
    );
    throw error;
  }
};

export const createPremiumQuoteRequest = async (data: {
  verificationRequestId: string;
  verificationTierId: string;
  userId: string;
  intendedUse: string;
  notes?: string | null;
}): Promise<PremiumQuote> => {
  try {
    const quote = await prismaClient.$transaction(async (tx) => {
      const request = await tx.verificationRequest.findFirst({
        where: {
          id: data.verificationRequestId,
          userId: data.userId,
          status: VerificationStatus.QUOTE_REQUIRED,
          verificationTier: {
            is: {
              id: data.verificationTierId,
              code: VerificationTierCode.PREMIUM,
              quoteRequired: true,
            },
          },
        },
        select: { id: true, monitoringPlanId: true },
      });
      if (!request) {
        throw new PricingRecordError("NOT_FOUND", "Premium quote request is unavailable");
      }

      const existing = await tx.premiumQuote.findFirst({
        where: {
          verificationRequestId: request.id,
          status: { in: [PremiumQuoteStatus.REQUESTED, PremiumQuoteStatus.ISSUED] },
        },
      });
      if (existing) {
        throw new PricingRecordError("INVALID_STATE", "A Premium quote is already in progress");
      }

      await tx.verificationRequest.update({
        where: { id: request.id },
        data: {
          intendedUse: data.intendedUse,
          ...(data.notes !== undefined ? { additionalNote: data.notes } : {}),
        },
      });

      return tx.premiumQuote.create({
        data: {
          verificationRequestId: request.id,
          verificationTierId: data.verificationTierId,
          monitoringPlanId: request.monitoringPlanId,
          status: PremiumQuoteStatus.REQUESTED,
        },
      });
    });
    logger.info(
      `Premium quote requested quoteId=${quote.id} requestId=${data.verificationRequestId}`,
    );
    return quote;
  } catch (error) {
    logger.error(
      `Error creating Premium quote request requestId=${data.verificationRequestId} ${error}`,
    );
    throw error;
  }
};

export const findPremiumQuoteForUser = async (verificationRequestId: string, userId: string) => {
  try {
    const quote = await prismaClient.premiumQuote.findFirst({
      where: {
        verificationRequestId,
        verificationRequest: { is: { userId } },
      },
      include: {
        verificationTier: true,
        monitoringPlan: true,
        verificationRequest: {
          select: {
            intendedUse: true,
            additionalNote: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    logger.info(
      `Premium quote lookup requestId=${verificationRequestId} userId=${userId} found=${!!quote}`,
    );
    return quote;
  } catch (error) {
    logger.error(
      `Error finding Premium quote requestId=${verificationRequestId} userId=${userId} ${error}`,
    );
    throw error;
  }
};

export const findLatestPremiumQuoteForAdmin = async (verificationRequestId: string) => {
  try {
    const quote = await prismaClient.premiumQuote.findFirst({
      where: { verificationRequestId },
      include: {
        verificationTier: true,
        monitoringPlan: true,
        verificationRequest: {
          select: {
            id: true,
            user: { select: { id: true, fullName: true, email: true, countryCode: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    logger.info(`Admin Premium quote lookup requestId=${verificationRequestId} found=${!!quote}`);
    return quote;
  } catch (error) {
    logger.error(`Error finding admin Premium quote requestId=${verificationRequestId} ${error}`);
    throw error;
  }
};

export const issuePremiumQuote = async (data: IssuePremiumQuoteData): Promise<PremiumQuote> => {
  try {
    if (data.expiresAt <= new Date()) {
      throw new PricingRecordError("INVALID_SELECTION", "Quote expiry must be in the future");
    }
    const quote = await prismaClient.$transaction(async (tx) => {
      const current = await tx.premiumQuote.findUnique({
        where: { id: data.quoteId },
        include: { verificationTier: true },
      });
      if (!current) throw new PricingRecordError("NOT_FOUND", "Premium quote not found");
      if (
        current.status !== PremiumQuoteStatus.REQUESTED ||
        current.verificationTier.code !== VerificationTierCode.PREMIUM ||
        current.verificationTier.quoteRequired !== true
      ) {
        throw new PricingRecordError("INVALID_STATE", "Premium quote cannot be issued");
      }
      if (
        data.quoteUsdCents < (current.verificationTier.minQuoteUsdCents ?? 0) ||
        data.quoteUsdCents > (current.verificationTier.maxQuoteUsdCents ?? Number.MAX_SAFE_INTEGER)
      ) {
        throw new PricingRecordError(
          "QUOTE_OUT_OF_RANGE",
          "Premium quote is outside the approved range",
        );
      }
      if (data.quoteNgnKobo <= 0 || data.rateVersion <= 0) {
        throw new PricingRecordError(
          "INVALID_SELECTION",
          "Premium quote pricing snapshot is invalid",
        );
      }
      const settings = await tx.pricingSettings.findUnique({
        where: { id: data.pricingSettingsId },
      });
      if (
        !settings ||
        !settings.active ||
        settings.version !== data.rateVersion ||
        !settings.usdToNgnRate.equals(data.usdToNgnRate) ||
        settings.roundingRule !== NgnRoundingRule.NEAREST_KOBO
      ) {
        throw new PricingRecordError(
          "INVALID_STATE",
          "Premium quote FX settings are no longer active",
        );
      }

      const updated = await tx.premiumQuote.updateMany({
        where: { id: data.quoteId, status: PremiumQuoteStatus.REQUESTED },
        data: {
          quoteUsdCents: data.quoteUsdCents,
          quoteNgnKobo: data.quoteNgnKobo,
          scopeSummary: data.scopeSummary,
          usdToNgnRate: data.usdToNgnRate,
          rateVersion: data.rateVersion,
          pricingSettingsId: data.pricingSettingsId,
          roundingRule: settings.roundingRule,
          tierVersion: current.verificationTier.version,
          expiresAt: data.expiresAt,
          issuedById: data.issuedById,
          status: PremiumQuoteStatus.ISSUED,
        },
      });
      if (updated.count !== 1) {
        throw new PricingRecordError("INVALID_STATE", "Premium quote has already changed");
      }
      return tx.premiumQuote.findUniqueOrThrow({ where: { id: data.quoteId } });
    });
    logger.info(`Premium quote issued quoteId=${quote.id} adminId=${data.issuedById}`);
    return quote;
  } catch (error) {
    logger.error(`Error issuing Premium quote quoteId=${data.quoteId} ${error}`);
    throw error;
  }
};

export const acceptPremiumQuote = async (data: { quoteId: string; userId: string; now?: Date }) => {
  try {
    const result = await prismaClient.$transaction(async (tx) => {
      const quote = await tx.premiumQuote.findFirst({
        where: { id: data.quoteId, verificationRequest: { is: { userId: data.userId } } },
      });
      if (!quote) throw new PricingRecordError("NOT_FOUND", "Premium quote not found");
      if (quote.status === PremiumQuoteStatus.ACCEPTED) {
        return { quote, acceptedNow: false };
      }
      if (quote.status !== PremiumQuoteStatus.ISSUED) {
        throw new PricingRecordError(
          "INVALID_STATE",
          "Premium quote is not available for acceptance",
        );
      }

      const now = data.now ?? new Date();
      if (!quote.expiresAt || quote.expiresAt <= now) {
        throw new PricingRecordError("QUOTE_EXPIRED", "Premium quote has expired");
      }

      const accepted = await tx.premiumQuote.updateMany({
        where: {
          id: data.quoteId,
          status: PremiumQuoteStatus.ISSUED,
          expiresAt: { gt: now },
          verificationRequest: { is: { userId: data.userId } },
        },
        data: { status: PremiumQuoteStatus.ACCEPTED, acceptedAt: now },
      });
      if (accepted.count !== 1) {
        throw new PricingRecordError("INVALID_STATE", "Premium quote has already changed");
      }

      const request = await tx.verificationRequest.updateMany({
        where: {
          id: quote.verificationRequestId,
          userId: data.userId,
          status: VerificationStatus.QUOTE_REQUIRED,
        },
        data: { status: VerificationStatus.PENDING_PAYMENT },
      });
      if (request.count !== 1) {
        throw new PricingRecordError(
          "INVALID_STATE",
          "Verification request is not awaiting a quote",
        );
      }
      const acceptedQuote = await tx.premiumQuote.findUniqueOrThrow({
        where: { id: quote.id },
      });
      return { quote: acceptedQuote, acceptedNow: true };
    });
    logger.info(
      `Premium quote acceptance quoteId=${data.quoteId} userId=${data.userId} acceptedNow=${result.acceptedNow}`,
    );
    return result;
  } catch (error) {
    logger.error(`Error accepting Premium quote quoteId=${data.quoteId} ${error}`);
    throw error;
  }
};

export const createPricedTransaction = async (
  data: CreatePricedTransactionData,
): Promise<Transaction> => {
  try {
    const transaction = await prismaClient.transaction.create({
      data: {
        amountInCents: data.amountInCents,
        currency: data.currency,
        method: data.method,
        provider: data.provider,
        purpose: data.purpose,
        tierAmountUsdCents: data.tierAmountUsdCents,
        monitoringAmountUsdCents: data.monitoringAmountUsdCents,
        totalUsdCents: data.totalUsdCents,
        fxRate: data.fxRate,
        fxRateVersion: data.fxRateVersion,
        fxRoundingRule: data.fxRoundingRule,
        pricingSnapshot: data.pricingSnapshot,
        verificationRequest: { connect: { id: data.verificationRequestId } },
        ...(data.verificationTierId
          ? { verificationTier: { connect: { id: data.verificationTierId } } }
          : {}),
        ...(data.providerPriceVersionId
          ? { providerPriceVersion: { connect: { id: data.providerPriceVersionId } } }
          : {}),
        ...(data.premiumQuoteId ? { premiumQuote: { connect: { id: data.premiumQuoteId } } } : {}),
      },
    });
    logger.info(
      `Priced transaction created transactionId=${transaction.id} requestId=${data.verificationRequestId}`,
    );
    return transaction;
  } catch (error) {
    logger.error(
      `Error creating priced transaction requestId=${data.verificationRequestId} ${error}`,
    );
    throw error;
  }
};

export interface ReservePricedTransactionResult {
  transaction: Transaction;
  reused: boolean;
}

export const reservePricedTransaction = async (
  data: CreatePricedTransactionData,
): Promise<ReservePricedTransactionResult> => {
  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const result = await prismaClient.$transaction(
          async (tx) => {
            const existing = await tx.transaction.findFirst({
              where: { verificationRequestId: data.verificationRequestId },
              orderBy: { createdAt: "desc" },
            });

            if (existing?.status === PaymentStatus.SUCCESS) {
              throw new PricingRecordError(
                "INVALID_STATE",
                "This verification request has already been paid for.",
              );
            }
            if (existing?.status === PaymentStatus.PENDING) {
              if (existing.currency !== data.currency || existing.provider !== data.provider) {
                throw new PricingRecordError(
                  "INVALID_STATE",
                  "A payment is already pending in another currency; complete it before switching payment methods.",
                );
              }
              const sameSnapshot =
                existing.pricingSnapshot !== null &&
                isDeepStrictEqual(existing.pricingSnapshot, data.pricingSnapshot);
              const checkoutReady =
                data.provider === PaymentProvider.STRIPE
                  ? Boolean(existing.providerRef && existing.authorizationUrl)
                  : Boolean(
                      existing.providerRef && existing.authorizationUrl && existing.accessCode,
                    );
              if (sameSnapshot && checkoutReady) {
                return { transaction: existing, reused: true };
              }
              throw new PricingRecordError(
                "INVALID_STATE",
                "A payment is already being initialized for this request.",
              );
            }

            const transactionFields = {
              amountInCents: data.amountInCents,
              currency: data.currency,
              method: data.method,
              provider: data.provider,
              purpose: data.purpose,
              verificationTierId: data.verificationTierId ?? null,
              providerPriceVersionId: data.providerPriceVersionId ?? null,
              premiumQuoteId: data.premiumQuoteId ?? null,
              tierAmountUsdCents: data.tierAmountUsdCents,
              monitoringAmountUsdCents: data.monitoringAmountUsdCents,
              totalUsdCents: data.totalUsdCents,
              fxRate: data.fxRate ?? null,
              fxRateVersion: data.fxRateVersion ?? null,
              fxRoundingRule: data.fxRoundingRule ?? null,
              pricingSnapshot: data.pricingSnapshot,
            };

            if (existing) {
              return {
                transaction: await tx.transaction.update({
                  where: { id: existing.id },
                  data: {
                    ...transactionFields,
                    status: PaymentStatus.PENDING,
                    providerRef: null,
                    authorizationUrl: null,
                    accessCode: null,
                    stripeSubscriptionId: null,
                    paidAt: null,
                  },
                }),
                reused: false,
              };
            }

            return {
              transaction: await tx.transaction.create({
                data: {
                  ...transactionFields,
                  verificationRequestId: data.verificationRequestId,
                  status: PaymentStatus.PENDING,
                },
              }),
              reused: false,
            };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
        logger.info(
          `Priced transaction reserved transactionId=${result.transaction.id} requestId=${data.verificationRequestId} reused=${result.reused}`,
        );
        return result;
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== "P2034" ||
          attempt === 2
        ) {
          throw error;
        }
      }
    }

    throw new Error("Unable to reserve payment transaction");
  } catch (error) {
    logger.error(
      `Error reserving priced transaction requestId=${data.verificationRequestId} ${error}`,
    );
    throw error;
  }
};

export const createMonitoringSubscription = async (data: CreateMonitoringSubscriptionData) => {
  try {
    const subscription = await prismaClient.$transaction(async (tx) => {
      const request = await tx.verificationRequest.findFirst({
        where: {
          id: data.verificationRequestId,
          userId: data.userId,
          monitoringPlanId: data.monitoringPlanId,
          recurringConsent: true,
        },
        select: { id: true },
      });
      if (!request) {
        throw new PricingRecordError(
          "INVALID_STATE",
          "Verification request has no matching recurring consent",
        );
      }
      const plan = await tx.monitoringPlan.findUnique({
        where: { id: data.monitoringPlanId },
      });
      if (!plan) throw new PricingRecordError("NOT_FOUND", "Monitoring plan not found");
      if (
        data.terms.version <= 0 ||
        data.terms.intervalCount <= 0 ||
        data.terms.priceUsdCents <= 0 ||
        data.terms.checksPerPeriod <= 0 ||
        data.terms.reportsPerPeriod <= 0 ||
        !Object.values(MonitoringInterval).includes(data.terms.code)
      ) {
        throw new PricingRecordError(
          "INVALID_SELECTION",
          "Monitoring subscription terms are invalid",
        );
      }
      if (data.providerPriceVersionId) {
        const priceVersion = await tx.providerPriceVersion.findFirst({
          where: {
            id: data.providerPriceVersionId,
            monitoringPlanId: plan.id,
            provider: data.provider,
            syncStatus: ProviderPriceSyncStatus.READY,
          },
          select: { id: true },
        });
        if (!priceVersion) {
          throw new PricingRecordError(
            "INVALID_SELECTION",
            "Provider price version does not match plan",
          );
        }
      }

      return tx.monitoringSubscription.upsert({
        where: {
          provider_providerSubscriptionId: {
            provider: data.provider,
            providerSubscriptionId: data.providerSubscriptionId,
          },
        },
        create: {
          userId: data.userId,
          verificationRequestId: data.verificationRequestId,
          monitoringPlanId: plan.id,
          providerPriceVersionId: data.providerPriceVersionId,
          provider: data.provider,
          providerSubscriptionId: data.providerSubscriptionId,
          customerCode: data.customerCode,
          emailToken: data.emailToken,
          consentAt: data.consentAt,
          startedAt: data.startedAt,
          currentPeriodStart: data.currentPeriodStart,
          currentPeriodEnd: data.currentPeriodEnd,
          planVersion: data.terms.version,
          interval: data.terms.code,
          intervalCount: data.terms.intervalCount,
          priceUsdCents: data.terms.priceUsdCents,
          checksPerPeriod: data.terms.checksPerPeriod,
          reportsPerPeriod: data.terms.reportsPerPeriod,
        },
        update: {},
      });
    });
    if (
      subscription.verificationRequestId !== data.verificationRequestId ||
      subscription.monitoringPlanId !== data.monitoringPlanId
    ) {
      throw new PricingRecordError(
        "INVALID_STATE",
        "Provider subscription is already mapped to a different request or plan",
      );
    }
    logger.info(
      `Monitoring subscription saved subscriptionId=${subscription.id} requestId=${data.verificationRequestId}`,
    );
    return subscription;
  } catch (error) {
    logger.error(
      `Error saving monitoring subscription requestId=${data.verificationRequestId} ${error}`,
    );
    throw error;
  }
};

export const createPaidSubscriptionPeriod = async (
  data: CreateSubscriptionPeriodData,
): Promise<SubscriptionPeriod> => {
  try {
    const period = await prismaClient.$transaction(async (tx) => {
      const subscription = await tx.monitoringSubscription.findUnique({
        where: { id: data.monitoringSubscriptionId },
      });
      if (
        !subscription ||
        !subscription.interval ||
        !subscription.checksPerPeriod ||
        !subscription.reportsPerPeriod
      ) {
        throw new PricingRecordError("NOT_FOUND", "Monitoring subscription terms not found");
      }
      if (data.periodEnd <= data.periodStart) {
        throw new PricingRecordError(
          "INVALID_SELECTION",
          "Subscription period end must be after start",
        );
      }
      const paidTransaction = await tx.transaction.findUnique({
        where: { id: data.paidTransactionId },
        select: { verificationRequestId: true, status: true },
      });
      if (
        !paidTransaction ||
        paidTransaction.verificationRequestId !== subscription.verificationRequestId ||
        paidTransaction.status !== PaymentStatus.SUCCESS
      ) {
        throw new PricingRecordError(
          "INVALID_STATE",
          "Subscription period requires a successful transaction for the same request",
        );
      }

      const saved = await tx.subscriptionPeriod.upsert({
        where: { paidTransactionId: data.paidTransactionId },
        create: {
          verificationRequestId: subscription.verificationRequestId,
          monitoringSubscriptionId: subscription.id,
          monitoringPlanId: subscription.monitoringPlanId,
          paidTransactionId: data.paidTransactionId,
          periodStart: data.periodStart,
          periodEnd: data.periodEnd,
          requiredSiteVisits: subscription.checksPerPeriod,
          requiredReports: subscription.reportsPerPeriod,
        },
        update: {},
      });
      if (
        saved.monitoringSubscriptionId !== subscription.id ||
        saved.verificationRequestId !== subscription.verificationRequestId ||
        saved.periodStart.getTime() !== data.periodStart.getTime() ||
        saved.periodEnd.getTime() !== data.periodEnd.getTime()
      ) {
        throw new PricingRecordError(
          "INVALID_STATE",
          "Paid transaction is already linked to a different subscription period",
        );
      }

      await tx.siteVisit.createMany({
        data: Array.from({ length: saved.requiredSiteVisits }, (_, index) => ({
          verificationRequestId: saved.verificationRequestId,
          subscriptionPeriodId: saved.id,
          visitNumber: index + 1,
        })),
        skipDuplicates: true,
      });
      const visitCount = await tx.siteVisit.count({ where: { subscriptionPeriodId: saved.id } });
      if (visitCount !== saved.requiredSiteVisits) {
        throw new PricingRecordError(
          "INVALID_STATE",
          "Subscription period has an invalid visit set",
        );
      }
      await tx.monitoringSubscription.update({
        where: { id: subscription.id },
        data: {
          currentPeriodStart: data.periodStart,
          currentPeriodEnd: data.periodEnd,
        },
      });
      return saved;
    });
    logger.info(
      `Subscription period saved periodId=${period.id} transactionId=${data.paidTransactionId}`,
    );
    return period;
  } catch (error) {
    logger.error(
      `Error creating subscription period transactionId=${data.paidTransactionId} ${error}`,
    );
    throw error;
  }
};

export const activateMonitoringForPaidTransaction = async (data: ActivatePaidMonitoringData) => {
  try {
    const transaction = await prismaClient.transaction.findUnique({
      where: { id: data.transactionId },
      include: {
        verificationRequest: {
          select: {
            userId: true,
            monitoringPlanId: true,
            recurringConsent: true,
            recurringConsentAt: true,
          },
        },
      },
    });
    if (!transaction) throw new PricingRecordError("NOT_FOUND", "Paid transaction not found");
    if (
      transaction.status !== PaymentStatus.SUCCESS ||
      transaction.provider !== data.provider ||
      transaction.verificationRequest.monitoringPlanId === null ||
      !transaction.verificationRequest.recurringConsent
    ) {
      throw new PricingRecordError(
        "INVALID_STATE",
        "Paid transaction has no matching monitoring consent",
      );
    }

    const snapshot =
      transaction.pricingSnapshot &&
      typeof transaction.pricingSnapshot === "object" &&
      !Array.isArray(transaction.pricingSnapshot)
        ? transaction.pricingSnapshot
        : null;
    if (!snapshot || snapshot.monitoring === null) {
      if (snapshot && snapshot.monitoring === null) return null;
      throw new PricingRecordError("INVALID_STATE", "Monitoring price snapshot is missing");
    }
    const termsSnapshot =
      typeof snapshot.monitoring === "object" &&
      snapshot.monitoring !== null &&
      !Array.isArray(snapshot.monitoring)
        ? snapshot.monitoring
        : null;
    if (!termsSnapshot) {
      throw new PricingRecordError("INVALID_STATE", "Monitoring price snapshot is invalid");
    }

    const planId = termsSnapshot.planId;
    const planCode = termsSnapshot.planCode;
    const providerPriceVersionId = termsSnapshot.providerPriceVersionId;
    const intervalCount = termsSnapshot.intervalCount;
    const planVersion = termsSnapshot.planVersion;
    const priceUsdCents = termsSnapshot.amountUsdCents;
    const checksPerPeriod = termsSnapshot.checksPerPeriod;
    const reportsPerPeriod = termsSnapshot.reportsPerPeriod;
    const consentAtValue = termsSnapshot.consentAt;
    const isPositiveSafeInteger = (value: Prisma.JsonValue | undefined): value is number =>
      typeof value === "number" && Number.isSafeInteger(value) && value > 0;
    const isMonitoringInterval = (
      value: Prisma.JsonValue | undefined,
    ): value is MonitoringInterval =>
      typeof value === "string" &&
      Object.values(MonitoringInterval).includes(value as MonitoringInterval);
    if (
      typeof planId !== "string" ||
      planId !== transaction.verificationRequest.monitoringPlanId ||
      !isMonitoringInterval(planCode) ||
      typeof providerPriceVersionId !== "string" ||
      providerPriceVersionId !== transaction.providerPriceVersionId ||
      !isPositiveSafeInteger(intervalCount) ||
      !isPositiveSafeInteger(planVersion) ||
      !isPositiveSafeInteger(priceUsdCents) ||
      !isPositiveSafeInteger(checksPerPeriod) ||
      !isPositiveSafeInteger(reportsPerPeriod)
    ) {
      throw new PricingRecordError("INVALID_STATE", "Monitoring price snapshot is incomplete");
    }
    const consentAt =
      typeof consentAtValue === "string"
        ? new Date(consentAtValue)
        : transaction.verificationRequest.recurringConsentAt;
    if (!consentAt || Number.isNaN(consentAt.getTime())) {
      throw new PricingRecordError("INVALID_STATE", "Recurring consent timestamp is missing");
    }
    if (!data.providerSubscriptionId || data.periodEnd <= data.periodStart) {
      throw new PricingRecordError("INVALID_SELECTION", "Provider subscription period is invalid");
    }

    const subscription = await createMonitoringSubscription({
      userId: transaction.verificationRequest.userId,
      verificationRequestId: transaction.verificationRequestId,
      monitoringPlanId: planId,
      providerPriceVersionId,
      provider: data.provider,
      providerSubscriptionId: data.providerSubscriptionId,
      customerCode: data.customerCode,
      emailToken: data.emailToken,
      consentAt,
      startedAt: data.startedAt ?? data.periodStart,
      currentPeriodStart: data.periodStart,
      currentPeriodEnd: data.periodEnd,
      terms: {
        version: planVersion,
        code: planCode,
        intervalCount,
        priceUsdCents,
        checksPerPeriod,
        reportsPerPeriod,
      },
    });

    const existingPeriod = await prismaClient.subscriptionPeriod.findUnique({
      where: { paidTransactionId: transaction.id },
    });
    if (existingPeriod) {
      if (existingPeriod.monitoringSubscriptionId !== subscription.id) {
        throw new PricingRecordError(
          "INVALID_STATE",
          "Paid transaction is already linked to a different monitoring subscription",
        );
      }
      return { subscription, period: existingPeriod };
    }

    const period = await createPaidSubscriptionPeriod({
      monitoringSubscriptionId: subscription.id,
      paidTransactionId: transaction.id,
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
    });
    return { subscription, period };
  } catch (error) {
    logger.error(`Error activating monitoring for transactionId=${data.transactionId} ${error}`);
    throw error;
  }
};

export const createReportForSubscriptionPeriod = async (data: CreatePeriodReportData) => {
  try {
    const report = await prismaClient.$transaction(async (tx) => {
      const period = await tx.subscriptionPeriod.findUnique({
        where: { id: data.subscriptionPeriodId },
      });
      if (!period) throw new PricingRecordError("NOT_FOUND", "Subscription period not found");
      if (period.completedSiteVisits < period.requiredSiteVisits) {
        throw new PricingRecordError("INVALID_STATE", "Required site visits are not complete");
      }
      if (period.reportCount >= period.requiredReports) {
        throw new PricingRecordError(
          "INVALID_STATE",
          "Required reports have already been submitted",
        );
      }

      const created = await tx.verificationReport.create({
        data: {
          verificationRequestId: period.verificationRequestId,
          transactionId: period.paidTransactionId,
          subscriptionPeriodId: period.id,
          submittedByAgentId: data.submittedByAgentId,
          verificationTierId: data.verificationTierId,
          tierNameSnapshot: data.tierNameSnapshot,
          packageScopeSnapshot: data.packageScopeSnapshot,
          summary: data.summary,
          findings: data.findings,
          reportUrl: data.reportUrl,
          additionalNotes: data.additionalNotes,
        },
      });
      const reportCount = period.reportCount + 1;
      await tx.subscriptionPeriod.update({
        where: { id: period.id },
        data: {
          reportCount: { increment: 1 },
          ...(reportCount >= period.requiredReports
            ? { status: SubscriptionPeriodStatus.COMPLETED }
            : {}),
        },
      });
      return created;
    });
    logger.info(
      `Subscription period report created reportId=${report.id} periodId=${data.subscriptionPeriodId}`,
    );
    return report;
  } catch (error) {
    logger.error(
      `Error creating subscription period report periodId=${data.subscriptionPeriodId} ${error}`,
    );
    throw error;
  }
};
