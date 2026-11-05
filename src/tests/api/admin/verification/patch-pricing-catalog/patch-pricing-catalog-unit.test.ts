const mockGetCatalogue = jest.fn();
const mockActivateBatch = jest.fn();
const mockSyncProviderPrices = jest.fn();

jest.mock("../../../../../api/services/database/pricing", () => ({
  getVerificationPricingCatalogue: (...args: unknown[]) => mockGetCatalogue(...args),
  activateProviderPriceVersionsBatch: (...args: unknown[]) => mockActivateBatch(...args),
}));
jest.mock("../../../../../api/services/provider-price-sync", () => ({
  syncProviderPrices: (...args: unknown[]) => mockSyncProviderPrices(...args),
}));

import { BadRequestError } from "../../../../../exceptions";
import { patchAdminPricingCatalog } from "../../../../../api/admin/verification/handlers/patch-pricing-catalog/patch-pricing-catalog.v1";
import { Prisma } from "@prisma/client";
import { Request, Response, NextFunction } from "express";

const makeRequest = (body: unknown): Request =>
  ({
    body,
    user: { id: "admin_1" },
  }) as unknown as Request;

const makeResponse = () => {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  return res as unknown as Response & typeof res;
};

const catalogue = (rate: string | null = "1500") => ({
  tiers: [
    {
      id: "tier_standard",
      active: true,
      quoteRequired: false,
      priceUsdCents: 6000,
    },
    {
      id: "tier_premium",
      active: true,
      quoteRequired: true,
      priceUsdCents: null,
    },
  ],
  monitoringPlans: [{ id: "plan_weekly", active: true, priceUsdCents: 10000 }],
  pricingSettings: rate ? { usdToNgnRate: new Prisma.Decimal(rate) } : null,
});

describe("admin pricing catalogue provider sync", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCatalogue.mockResolvedValue(catalogue());
    mockSyncProviderPrices.mockImplementation(async (input) => ({
      activationData: {
        target: input.target,
        version: 2,
        usdAmountCents: input.usdAmountCents,
        prices: [],
      },
    }));
    mockActivateBatch.mockResolvedValue([]);
  });

  it("syncs changed USD prices to both providers before batch activation", async () => {
    const req = makeRequest({
      tiers: [{ id: "tier_standard", priceUsdCents: 7000 }],
      monitoringPlans: [{ id: "plan_weekly", priceUsdCents: 12000 }],
    });
    const res = makeResponse();
    const next = jest.fn() as NextFunction;

    await patchAdminPricingCatalog(req, res, next);

    expect(mockSyncProviderPrices).toHaveBeenCalledTimes(2);
    expect(mockSyncProviderPrices).toHaveBeenNthCalledWith(
      1,
      {
        target: { verificationTierId: "tier_standard" },
        usdAmountCents: 7000,
        ngnAmountKobo: 10500000,
      },
      { activate: false },
    );
    expect(mockSyncProviderPrices).toHaveBeenNthCalledWith(
      2,
      {
        target: { monitoringPlanId: "plan_weekly" },
        usdAmountCents: 12000,
        ngnAmountKobo: 18000000,
      },
      { activate: false },
    );
    expect(mockActivateBatch).toHaveBeenCalledTimes(1);
    expect(mockActivateBatch.mock.invocationCallOrder[0]).toBeGreaterThan(
      mockSyncProviderPrices.mock.invocationCallOrder[1],
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          syncedTargets: 2,
          existingSubscriptionsUpdated: false,
        }),
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("reprices every fixed tier and monitoring plan when only the FX rate changes", async () => {
    const req = makeRequest({ usdToNgnRate: "1600" });
    const res = makeResponse();
    const next = jest.fn() as NextFunction;

    await patchAdminPricingCatalog(req, res, next);

    expect(mockSyncProviderPrices).toHaveBeenCalledTimes(2);
    expect(mockSyncProviderPrices).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        target: { verificationTierId: "tier_standard" },
        ngnAmountKobo: 9600000,
      }),
      { activate: false },
    );
    expect(mockSyncProviderPrices).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        target: { monitoringPlanId: "plan_weekly" },
        ngnAmountKobo: 16000000,
      }),
      { activate: false },
    );
    const activation = mockActivateBatch.mock.calls[0][0];
    expect(activation.pricingSettings.usdToNgnRate.toString()).toBe("1600");
    expect(activation.pricingSettings.updatedById).toBe("admin_1");
    expect(next).not.toHaveBeenCalled();
  });

  it("does not activate any staged prices when a provider sync fails", async () => {
    mockSyncProviderPrices.mockRejectedValueOnce(new Error("Stripe unavailable"));
    const req = makeRequest({
      tiers: [{ id: "tier_standard", priceUsdCents: 7000 }],
    });
    const res = makeResponse();
    const next = jest.fn() as NextFunction;

    await patchAdminPricingCatalog(req, res, next);

    expect(mockActivateBatch).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 500 }));
  });

  it("rejects a catalogue price change when no NGN conversion rate is configured", async () => {
    mockGetCatalogue.mockResolvedValue(catalogue(null));
    const req = makeRequest({
      tiers: [{ id: "tier_standard", priceUsdCents: 7000 }],
    });
    const res = makeResponse();
    const next = jest.fn() as NextFunction;

    await patchAdminPricingCatalog(req, res, next);

    expect(mockSyncProviderPrices).not.toHaveBeenCalled();
    expect(mockActivateBatch).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
  });
});
