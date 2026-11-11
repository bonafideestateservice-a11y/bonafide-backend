const transaction = {
  verificationRequest: {
    findFirst: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    findUniqueOrThrow: jest.fn(),
  },
  verificationTier: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  monitoringPlan: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
  },
  premiumQuote: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    create: jest.fn(),
    updateMany: jest.fn(),
  },
  pricingSettings: {
    findUnique: jest.fn(),
  },
  providerPriceVersion: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  monitoringSubscription: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
  },
  transaction: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  subscriptionPeriod: {
    upsert: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  siteVisit: {
    createMany: jest.fn(),
    count: jest.fn(),
    findUnique: jest.fn(),
    updateMany: jest.fn(),
    findUniqueOrThrow: jest.fn(),
  },
  verificationReport: {
    create: jest.fn(),
  },
};

const prisma = {
  verificationRequest: { findFirst: jest.fn() },
  verificationTier: { findMany: jest.fn() },
  monitoringPlan: { findMany: jest.fn() },
  pricingSettings: { findFirst: jest.fn() },
  premiumQuote: { findFirst: jest.fn() },
  providerPriceVersion: { findFirst: jest.fn() },
  transaction: { create: jest.fn(), findUnique: jest.fn() },
  monitoringSubscription: { upsert: jest.fn() },
  subscriptionPeriod: { findUnique: jest.fn() },
  $transaction: jest.fn((callback: (tx: typeof transaction) => Promise<unknown>) =>
    callback(transaction),
  ),
};

jest.mock("../../../utils/prisma", () => ({ prismaClient: prisma }));

import {
  PaymentProvider,
  PaymentStatus,
  PremiumQuoteStatus,
  Prisma,
  VerificationStatus,
  VerificationTierCode,
} from "@prisma/client";
import {
  acceptPremiumQuote,
  activateMonitoringForPaidTransaction,
  activateProviderPriceVersionsBatch,
  createPaidSubscriptionPeriod,
  createVerificationCheckoutTransactionData,
  createPremiumQuoteRequest,
  findVerificationCheckoutPricing,
  getVerificationPricingCatalogue,
  issuePremiumQuote,
  reservePricedTransaction,
  updateVerificationRequestPricing,
} from "../../../api/services/database/pricing";

describe("pricing database services", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("uses active USD provider prices and calculates the NGN comparison for Stripe", async () => {
    prisma.verificationRequest.findFirst.mockResolvedValue({
      id: "request-1",
      userId: "client-1",
      status: VerificationStatus.DRAFT,
      verificationTierId: "tier-standard",
      verificationTier: {
        id: "tier-standard",
        code: VerificationTierCode.STANDARD,
        name: "Standard",
        priceUsdCents: 6000,
        quoteRequired: false,
        active: true,
      },
      monitoringPlanId: null,
      monitoringPlan: null,
      recurringConsent: false,
      recurringConsentAt: null,
      user: { countryCode: "US", email: "client@example.com", paystackCustomerCode: null },
    });

    prisma.pricingSettings.findFirst.mockResolvedValue({
      version: 3,
      usdToNgnRate: new Prisma.Decimal("1500"),
      roundingRule: "NEAREST_KOBO",
    });
    prisma.providerPriceVersion.findFirst.mockResolvedValue({
      id: "stripe-tier-v1",
      providerPriceId: "price_standard_v1",
      usdAmountCents: 6000,
      amountMinor: 6000,
    });

    const result = await findVerificationCheckoutPricing({
      requestId: "request-1",
      userId: "client-1",
      provider: PaymentProvider.STRIPE,
    });

    expect(result.amountMinor).toBe(6000);
    expect(result.totalNgnKobo).toBe(9000000);
    expect(result.tierPriceVersion?.providerPriceId).toBe("price_standard_v1");
    expect(prisma.providerPriceVersion.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          provider: PaymentProvider.STRIPE,
          currency: "USD",
          activeForNewCheckout: true,
        }),
      }),
    );
  });

  it("persists Premium intended use and client notes with the quote request", async () => {
    const quote = {
      id: "quote-1",
      verificationRequestId: "request-1",
      status: PremiumQuoteStatus.REQUESTED,
    };
    transaction.verificationRequest.findFirst.mockResolvedValue({
      id: "request-1",
      monitoringPlanId: null,
    });
    transaction.premiumQuote.findFirst.mockResolvedValue(null);
    transaction.premiumQuote.create.mockResolvedValue(quote);

    const result = await createPremiumQuoteRequest({
      verificationRequestId: "request-1",
      verificationTierId: "tier-premium",
      userId: "client-1",
      intendedUse: "Residential rental investment",
      notes: "Assess access to the site.",
    });

    expect(transaction.verificationRequest.update).toHaveBeenCalledWith({
      where: { id: "request-1" },
      data: {
        intendedUse: "Residential rental investment",
        additionalNote: "Assess access to the site.",
      },
    });
    expect(result).toBe(quote);
  });

  it("persists the admin-provided Premium quote scope summary", async () => {
    transaction.premiumQuote.findUnique.mockResolvedValue({
      id: "quote-1",
      status: PremiumQuoteStatus.REQUESTED,
      verificationTier: {
        code: VerificationTierCode.PREMIUM,
        quoteRequired: true,
        minQuoteUsdCents: 10000,
        maxQuoteUsdCents: 20000,
        version: 1,
      },
    });
    transaction.pricingSettings.findUnique.mockResolvedValue({
      id: "pricing-1",
      active: true,
      version: 3,
      usdToNgnRate: new Prisma.Decimal("1500"),
      roundingRule: "NEAREST_KOBO",
    });
    transaction.premiumQuote.updateMany.mockResolvedValue({ count: 1 });
    transaction.premiumQuote.findUniqueOrThrow.mockResolvedValue({
      id: "quote-1",
      scopeSummary: "Valuation and feasibility assessment",
    });

    await issuePremiumQuote({
      quoteId: "quote-1",
      issuedById: "admin-1",
      scopeSummary: "Valuation and feasibility assessment",
      quoteUsdCents: 15000,
      quoteNgnKobo: 22500000,
      usdToNgnRate: "1500",
      rateVersion: 3,
      pricingSettingsId: "pricing-1",
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    expect(transaction.premiumQuote.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          scopeSummary: "Valuation and feasibility assessment",
        }),
      }),
    );
  });

  it("updates Premium quote bounds transactionally without provider-price activations", async () => {
    transaction.verificationTier.findFirst.mockResolvedValue({ id: "tier-premium" });
    transaction.verificationTier.update.mockResolvedValue({});
    transaction.providerPriceVersion.findMany.mockResolvedValue([]);

    await activateProviderPriceVersionsBatch({
      activations: [],
      quoteRanges: [
        {
          id: "tier-premium",
          minQuoteUsdCents: 12000,
          maxQuoteUsdCents: 25000,
        },
      ],
    });

    expect(transaction.verificationTier.findFirst).toHaveBeenCalledWith({
      where: { id: "tier-premium", active: true, quoteRequired: true },
      select: { id: true },
    });
    expect(transaction.verificationTier.update).toHaveBeenCalledWith({
      where: { id: "tier-premium" },
      data: { minQuoteUsdCents: 12000, maxQuoteUsdCents: 25000 },
    });
  });

  it("charges the package plus the first monitoring period with Paystack", async () => {
    prisma.verificationRequest.findFirst.mockResolvedValue({
      id: "request-1",
      userId: "client-1",
      status: VerificationStatus.DRAFT,
      verificationTierId: "tier-standard",
      verificationTier: {
        id: "tier-standard",
        code: VerificationTierCode.STANDARD,
        name: "Standard",
        priceUsdCents: 6000,
        quoteRequired: false,
        active: true,
      },
      monitoringPlanId: "plan-monthly",
      monitoringPlan: {
        id: "plan-monthly",
        code: "MONTHLY",
        name: "Monthly",
        priceUsdCents: 6000,
        intervalCount: 1,
        checksPerPeriod: 2,
        reportsPerPeriod: 1,
        version: 1,
        active: true,
      },
      recurringConsent: true,
      recurringConsentAt: new Date("2026-11-05T10:00:00.000Z"),
      user: { countryCode: "NG", email: "client@example.com", paystackCustomerCode: "CUS_1" },
    });
    prisma.pricingSettings.findFirst.mockResolvedValue({
      version: 3,
      usdToNgnRate: new Prisma.Decimal("1500"),
      roundingRule: "NEAREST_KOBO",
    });
    prisma.providerPriceVersion.findFirst
      .mockResolvedValueOnce({
        id: "paystack-tier-v1",
        providerPriceId: null,
        provider: PaymentProvider.PAYSTACK,
        currency: "NGN",
        usdAmountCents: 6000,
        amountMinor: 9000000,
      })
      .mockResolvedValueOnce({
        id: "paystack-monitor-v1",
        providerPriceId: "PLN_monthly_v1",
        provider: PaymentProvider.PAYSTACK,
        currency: "NGN",
        usdAmountCents: 6000,
        amountMinor: 9000000,
        interval: "MONTHLY",
        intervalCount: 1,
      });

    const result = await findVerificationCheckoutPricing({
      requestId: "request-1",
      userId: "client-1",
      provider: PaymentProvider.PAYSTACK,
    });
    const transactionData = createVerificationCheckoutTransactionData(result);

    expect(result.amountMinor).toBe(18000000);
    expect(result.totalUsdCents).toBe(12000);
    expect(transactionData.purpose).toBe("INITIAL_PURCHASE");
    expect(transactionData.providerPriceVersionId).toBe("paystack-monitor-v1");
    expect(transactionData.pricingSnapshot).toMatchObject({
      monitoring: { planId: "plan-monthly", amountMinor: 9000000 },
      total: { usdCents: 12000, ngnKobo: 18000000, amountMinor: 18000000 },
    });
  });

  it("uses the accepted Premium quote's locked NGN total instead of the current rate", async () => {
    prisma.verificationRequest.findFirst.mockResolvedValue({
      id: "request-1",
      userId: "client-1",
      status: VerificationStatus.PENDING_PAYMENT,
      verificationTierId: "tier-premium",
      verificationTier: {
        id: "tier-premium",
        code: VerificationTierCode.PREMIUM,
        name: "Premium",
        priceUsdCents: null,
        quoteRequired: true,
        active: true,
      },
      monitoringPlanId: null,
      monitoringPlan: null,
      recurringConsent: false,
      recurringConsentAt: null,
      user: { countryCode: "NG", email: "client@example.com", paystackCustomerCode: "CUS_1" },
    });
    prisma.premiumQuote.findFirst.mockResolvedValue({
      id: "quote-1",
      verificationTierId: "tier-premium",
      monitoringPlanId: null,
      status: PremiumQuoteStatus.ACCEPTED,
      quoteUsdCents: 15000,
      quoteNgnKobo: 22500000,
      usdToNgnRate: new Prisma.Decimal("1500"),
      rateVersion: 3,
      roundingRule: "NEAREST_KOBO",
      expiresAt: new Date("2026-11-20T10:00:00.000Z"),
    });
    prisma.pricingSettings.findFirst.mockResolvedValue({
      version: 4,
      usdToNgnRate: new Prisma.Decimal("1600"),
      roundingRule: "NEAREST_KOBO",
    });

    const result = await findVerificationCheckoutPricing({
      requestId: "request-1",
      userId: "client-1",
      provider: PaymentProvider.PAYSTACK,
      now: new Date("2026-11-05T10:00:00.000Z"),
    });
    const transactionData = createVerificationCheckoutTransactionData(result);

    expect(result.amountMinor).toBe(22500000);
    expect(transactionData.amountInCents).toBe(22500000);
    expect(transactionData.purpose).toBe("PREMIUM_QUOTE");
    expect(transactionData.premiumQuoteId).toBe("quote-1");
    expect(transactionData.pricingSnapshot).toMatchObject({
      verification: {
        quoteId: "quote-1",
        amountMinor: 22500000,
        quoteRate: "1500",
        quoteRateVersion: 3,
      },
    });
  });

  it("reuses a pending priced transaction only when its immutable snapshot matches", async () => {
    const snapshot = { version: 1, total: { amountMinor: 6000 } };
    const data = {
      verificationRequestId: "request-1",
      amountInCents: 6000,
      currency: "USD",
      method: "CARD" as const,
      provider: PaymentProvider.STRIPE,
      purpose: "INITIAL_PURCHASE" as const,
      tierAmountUsdCents: 6000,
      monitoringAmountUsdCents: 0,
      totalUsdCents: 6000,
      pricingSnapshot: snapshot,
    };
    transaction.transaction.findFirst.mockResolvedValue({
      id: "transaction-1",
      status: PaymentStatus.PENDING,
      currency: "USD",
      provider: PaymentProvider.STRIPE,
      providerRef: "cs_1",
      authorizationUrl: "https://checkout.stripe.com/cs_1",
      pricingSnapshot: snapshot,
    });

    await expect(reservePricedTransaction(data)).resolves.toMatchObject({
      transaction: { id: "transaction-1" },
      reused: true,
    });
    expect(transaction.transaction.create).not.toHaveBeenCalled();
    expect(transaction.transaction.update).not.toHaveBeenCalled();
  });

  it("creates the initial paid monitoring period and configured visit set from the transaction snapshot", async () => {
    const periodStart = new Date("2026-11-05T10:00:00.000Z");
    const periodEnd = new Date("2026-12-05T10:00:00.000Z");
    const consentAt = new Date("2026-11-04T10:00:00.000Z");
    const subscription = {
      id: "monitoring-subscription-1",
      verificationRequestId: "request-1",
      monitoringPlanId: "plan-monthly",
      interval: "MONTHLY",
      checksPerPeriod: 2,
      reportsPerPeriod: 1,
    };
    const period = {
      id: "period-1",
      verificationRequestId: "request-1",
      monitoringSubscriptionId: subscription.id,
      periodStart,
      periodEnd,
      requiredSiteVisits: 2,
    };
    prisma.transaction.findUnique.mockResolvedValue({
      id: "initial-transaction",
      verificationRequestId: "request-1",
      status: PaymentStatus.SUCCESS,
      provider: PaymentProvider.PAYSTACK,
      providerPriceVersionId: "paystack-monitor-v1",
      pricingSnapshot: {
        monitoring: {
          planId: "plan-monthly",
          planCode: "MONTHLY",
          planVersion: 1,
          intervalCount: 1,
          amountUsdCents: 6000,
          checksPerPeriod: 2,
          reportsPerPeriod: 1,
          providerPriceVersionId: "paystack-monitor-v1",
          consentAt: consentAt.toISOString(),
        },
      },
      verificationRequest: {
        userId: "client-1",
        monitoringPlanId: "plan-monthly",
        recurringConsent: true,
        recurringConsentAt: consentAt,
      },
    });
    prisma.subscriptionPeriod.findUnique.mockResolvedValue(null);
    transaction.verificationRequest.findFirst.mockResolvedValue({ id: "request-1" });
    transaction.monitoringPlan.findUnique.mockResolvedValue({ id: "plan-monthly" });
    transaction.providerPriceVersion.findFirst.mockResolvedValue({
      id: "paystack-monitor-v1",
    });
    transaction.monitoringSubscription.upsert.mockResolvedValue(subscription);
    transaction.monitoringSubscription.findUnique.mockResolvedValue(subscription);
    transaction.transaction.findUnique.mockResolvedValue({
      verificationRequestId: "request-1",
      status: PaymentStatus.SUCCESS,
    });
    transaction.subscriptionPeriod.upsert.mockResolvedValue(period);
    transaction.siteVisit.count.mockResolvedValue(2);

    await expect(
      activateMonitoringForPaidTransaction({
        transactionId: "initial-transaction",
        provider: PaymentProvider.PAYSTACK,
        providerSubscriptionId: "SUB_1",
        customerCode: "CUS_1",
        startedAt: periodStart,
        periodStart,
        periodEnd,
      }),
    ).resolves.toMatchObject({ subscription, period });

    expect(transaction.monitoringSubscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          provider_providerSubscriptionId: {
            provider: PaymentProvider.PAYSTACK,
            providerSubscriptionId: "SUB_1",
          },
        },
        create: expect.objectContaining({
          verificationRequestId: "request-1",
          monitoringPlanId: "plan-monthly",
          consentAt,
          checksPerPeriod: 2,
        }),
      }),
    );
    expect(transaction.siteVisit.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({ visitNumber: 1, subscriptionPeriodId: "period-1" }),
          expect.objectContaining({ visitNumber: 2, subscriptionPeriodId: "period-1" }),
        ],
        skipDuplicates: true,
      }),
    );
  });

  it("reads only active catalog entries and the active FX version", async () => {
    const tiers = [{ id: "tier-standard" }];
    const plans = [{ id: "plan-weekly" }];
    const settings = { id: "fx-v3", version: 3 };
    prisma.verificationTier.findMany.mockResolvedValue(tiers);
    prisma.monitoringPlan.findMany.mockResolvedValue(plans);
    prisma.pricingSettings.findFirst.mockResolvedValue(settings);

    await expect(getVerificationPricingCatalogue()).resolves.toEqual({
      tiers,
      monitoringPlans: plans,
      pricingSettings: settings,
    });
    expect(prisma.verificationTier.findMany).toHaveBeenCalledWith({
      where: { active: true },
      orderBy: { code: "asc" },
    });
    expect(prisma.monitoringPlan.findMany).toHaveBeenCalledWith({
      where: { active: true },
      orderBy: { code: "asc" },
    });
    expect(prisma.pricingSettings.findFirst).toHaveBeenCalledWith({
      where: { active: true },
      orderBy: { version: "desc" },
    });
  });

  it("rejects monitoring on Basic before changing the request", async () => {
    transaction.verificationRequest.findFirst.mockResolvedValue({ id: "request-1" });
    transaction.verificationTier.findFirst.mockResolvedValue({
      id: "tier-basic",
      code: VerificationTierCode.BASIC,
      quoteRequired: false,
    });
    transaction.monitoringPlan.findFirst.mockResolvedValue({ id: "plan-weekly" });

    await expect(
      updateVerificationRequestPricing({
        requestId: "request-1",
        userId: "client-1",
        verificationTierId: "tier-basic",
        monitoringPlanId: "plan-weekly",
        recurringConsent: true,
      }),
    ).rejects.toMatchObject({ code: "INVALID_SELECTION" });
    expect(transaction.verificationRequest.updateMany).not.toHaveBeenCalled();
  });

  it("accepts an unexpired quote once and moves the request to payment", async () => {
    const now = new Date("2026-11-05T10:00:00.000Z");
    const quote = {
      id: "quote-1",
      status: PremiumQuoteStatus.ISSUED,
      expiresAt: new Date("2026-11-19T10:00:00.000Z"),
      verificationRequestId: "request-1",
    };
    const acceptedQuote = { ...quote, status: PremiumQuoteStatus.ACCEPTED, acceptedAt: now };
    transaction.premiumQuote.findFirst.mockResolvedValue(quote);
    transaction.premiumQuote.updateMany.mockResolvedValue({ count: 1 });
    transaction.verificationRequest.updateMany.mockResolvedValue({ count: 1 });
    transaction.premiumQuote.findUniqueOrThrow.mockResolvedValue(acceptedQuote);

    await expect(
      acceptPremiumQuote({ quoteId: "quote-1", userId: "client-1", now }),
    ).resolves.toEqual({ quote: acceptedQuote, acceptedNow: true });
    expect(transaction.premiumQuote.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "quote-1",
          status: PremiumQuoteStatus.ISSUED,
          expiresAt: { gt: now },
        }),
        data: { status: PremiumQuoteStatus.ACCEPTED, acceptedAt: now },
      }),
    );
    expect(transaction.verificationRequest.updateMany).toHaveBeenCalledWith({
      where: {
        id: "request-1",
        userId: "client-1",
        status: VerificationStatus.QUOTE_REQUIRED,
      },
      data: { status: VerificationStatus.PENDING_PAYMENT },
    });
  });

  it("uses the saved monitoring terms to create an idempotent visit set", async () => {
    const periodStart = new Date("2026-11-01T00:00:00.000Z");
    const periodEnd = new Date("2026-12-01T00:00:00.000Z");
    transaction.monitoringSubscription.findUnique.mockResolvedValue({
      id: "subscription-1",
      verificationRequestId: "request-1",
      monitoringPlanId: "plan-monthly",
      interval: "MONTHLY",
      checksPerPeriod: 2,
      reportsPerPeriod: 1,
    });
    transaction.subscriptionPeriod.upsert.mockResolvedValue({
      id: "period-1",
      verificationRequestId: "request-1",
      monitoringSubscriptionId: "subscription-1",
      periodStart,
      periodEnd,
      requiredSiteVisits: 2,
    });
    transaction.transaction.findUnique.mockResolvedValue({
      verificationRequestId: "request-1",
      status: "SUCCESS",
    });
    transaction.siteVisit.count.mockResolvedValue(2);

    await createPaidSubscriptionPeriod({
      monitoringSubscriptionId: "subscription-1",
      paidTransactionId: "transaction-1",
      periodStart,
      periodEnd,
    });

    expect(transaction.siteVisit.createMany).toHaveBeenCalledWith({
      data: [
        {
          verificationRequestId: "request-1",
          subscriptionPeriodId: "period-1",
          visitNumber: 1,
        },
        {
          verificationRequestId: "request-1",
          subscriptionPeriodId: "period-1",
          visitNumber: 2,
        },
      ],
      skipDuplicates: true,
    });
    expect(transaction.monitoringSubscription.update).toHaveBeenCalledWith({
      where: { id: "subscription-1" },
      data: { currentPeriodStart: periodStart, currentPeriodEnd: periodEnd },
    });
  });
});
