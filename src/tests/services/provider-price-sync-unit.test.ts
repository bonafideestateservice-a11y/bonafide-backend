const mockFindTarget = jest.fn();
const mockReserveVersions = jest.fn();
const mockUpdateVersionSync = jest.fn();
const mockActivateVersions = jest.fn();
const mockSyncPaystackPlan = jest.fn();
const mockSyncStripePrice = jest.fn();

jest.mock("../../api/services/database/pricing", () => ({
  findPricingTargetForProviderSync: (...args: unknown[]) => mockFindTarget(...args),
  reserveProviderPriceVersions: (...args: unknown[]) => mockReserveVersions(...args),
  updateProviderPriceVersionSync: (...args: unknown[]) => mockUpdateVersionSync(...args),
  activateProviderPriceVersions: (...args: unknown[]) => mockActivateVersions(...args),
}));
jest.mock("../../libs/paystack/paystack", () => ({
  syncPaystackPlan: (...args: unknown[]) => mockSyncPaystackPlan(...args),
}));
jest.mock("../../libs/stripe/stripe", () => ({
  syncStripePrice: (...args: unknown[]) => mockSyncStripePrice(...args),
}));

import { MonitoringInterval, PaymentProvider, ProviderPriceSyncStatus } from "@prisma/client";
import { syncProviderPrices } from "../../api/services/provider-price-sync";

describe("provider price synchronization", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindTarget.mockResolvedValue({
      kind: "tier",
      item: {
        id: "tier_basic",
        name: "Basic",
        description: "Basic verification",
      },
    });
    mockReserveVersions.mockResolvedValue([
      {
        id: "stripe-price-version",
        version: 1,
        provider: PaymentProvider.STRIPE,
        syncStatus: ProviderPriceSyncStatus.PENDING,
      },
      {
        id: "paystack-price-version",
        version: 1,
        provider: PaymentProvider.PAYSTACK,
        syncStatus: ProviderPriceSyncStatus.PENDING,
      },
    ]);
    mockUpdateVersionSync.mockResolvedValue({});
    mockActivateVersions.mockResolvedValue([]);
    mockSyncStripePrice.mockResolvedValue({ productId: "prod_1", priceId: "price_1" });
    mockSyncPaystackPlan.mockResolvedValue({ planCode: "PLN_1" });
  });

  it("synchronizes fixed tier USD and NGN amounts before activating", async () => {
    await syncProviderPrices({
      target: { verificationTierId: "tier_basic" },
      usdAmountCents: 2500,
      ngnAmountKobo: 3750000,
    });

    expect(mockSyncStripePrice).toHaveBeenCalledWith(
      expect.objectContaining({ amountMinor: 2500, currency: "USD" }),
    );
    expect(mockSyncPaystackPlan).not.toHaveBeenCalled();
    expect(mockUpdateVersionSync).toHaveBeenNthCalledWith(
      2,
      "paystack-price-version",
      expect.objectContaining({
        syncStatus: ProviderPriceSyncStatus.READY,
        providerPriceId: null,
      }),
    );
    expect(mockActivateVersions).toHaveBeenCalledTimes(1);
    expect(mockActivateVersions.mock.invocationCallOrder[0]).toBeGreaterThan(
      mockUpdateVersionSync.mock.invocationCallOrder[1],
    );
  });

  it("can stage synced provider prices without activating them", async () => {
    const result = await syncProviderPrices(
      {
        target: { verificationTierId: "tier_basic" },
        usdAmountCents: 2500,
        ngnAmountKobo: 3750000,
      },
      { activate: false },
    );

    expect(mockActivateVersions).not.toHaveBeenCalled();
    expect(result.activationData).toEqual(
      expect.objectContaining({
        target: { verificationTierId: "tier_basic" },
        version: 1,
        usdAmountCents: 2500,
      }),
    );
  });

  it("maps quarterly monitoring to three Stripe months and Paystack quarterly", async () => {
    mockFindTarget.mockResolvedValueOnce({
      kind: "monitoring",
      item: {
        id: "monitoring_quarterly",
        name: "Quarterly Monitoring",
        description: "Quarterly service",
        code: MonitoringInterval.QUARTERLY,
        intervalCount: 3,
        checksPerPeriod: 3,
        reportsPerPeriod: 1,
      },
    });
    mockReserveVersions.mockResolvedValue([
      {
        id: "stripe-price-version",
        version: 1,
        provider: PaymentProvider.STRIPE,
        syncStatus: ProviderPriceSyncStatus.PENDING,
      },
      {
        id: "paystack-price-version",
        version: 1,
        provider: PaymentProvider.PAYSTACK,
        syncStatus: ProviderPriceSyncStatus.PENDING,
      },
    ]);

    await syncProviderPrices({
      target: { monitoringPlanId: "monitoring_quarterly" },
      usdAmountCents: 20000,
      ngnAmountKobo: 30000000,
    });

    expect(mockSyncStripePrice).toHaveBeenCalledWith(
      expect.objectContaining({
        recurring: { interval: "month", intervalCount: 3 },
      }),
    );
    expect(mockSyncPaystackPlan).toHaveBeenCalledWith(
      expect.objectContaining({ interval: "quarterly", amount: 30000000 }),
    );
  });

  it("does not activate a new version when any provider sync fails", async () => {
    mockFindTarget.mockResolvedValueOnce({
      kind: "monitoring",
      item: {
        id: "monitoring_monthly",
        name: "Monthly Monitoring",
        description: "Monthly service",
        code: MonitoringInterval.MONTHLY,
        intervalCount: 1,
        checksPerPeriod: 1,
        reportsPerPeriod: 1,
      },
    });
    mockSyncPaystackPlan.mockRejectedValueOnce(new Error("Paystack unavailable"));

    await expect(
      syncProviderPrices({
        target: { monitoringPlanId: "monitoring_monthly" },
        usdAmountCents: 6000,
        ngnAmountKobo: 9000000,
      }),
    ).rejects.toThrow("Paystack unavailable");

    expect(mockUpdateVersionSync).toHaveBeenLastCalledWith(
      "paystack-price-version",
      expect.objectContaining({
        syncStatus: ProviderPriceSyncStatus.FAILED,
        syncError: "Paystack unavailable",
      }),
    );
    expect(mockActivateVersions).not.toHaveBeenCalled();
  });

  it("revalidates ready provider versions before reusing them", async () => {
    mockFindTarget.mockResolvedValue({
      kind: "monitoring",
      item: {
        id: "monitoring_monthly",
        name: "Monthly Monitoring",
        description: "Monthly service",
        code: MonitoringInterval.MONTHLY,
        intervalCount: 1,
        checksPerPeriod: 1,
        reportsPerPeriod: 1,
      },
    });
    mockReserveVersions.mockResolvedValue([
      {
        id: "stripe-price-version",
        version: 4,
        provider: PaymentProvider.STRIPE,
        syncStatus: ProviderPriceSyncStatus.READY,
        activeForNewCheckout: true,
      },
      {
        id: "paystack-price-version",
        version: 4,
        provider: PaymentProvider.PAYSTACK,
        syncStatus: ProviderPriceSyncStatus.READY,
        activeForNewCheckout: true,
      },
    ]);

    const data = {
      target: { monitoringPlanId: "monitoring_monthly" },
      usdAmountCents: 6000,
      ngnAmountKobo: 9000000,
    };
    await syncProviderPrices(data);
    await syncProviderPrices(data);

    expect(mockSyncStripePrice).toHaveBeenCalledTimes(2);
    expect(mockSyncPaystackPlan).toHaveBeenCalledTimes(2);
    expect(mockActivateVersions).toHaveBeenCalledTimes(2);
  });

  it("fails visibly instead of overwriting an active synced mismatch", async () => {
    mockFindTarget.mockResolvedValueOnce({
      kind: "monitoring",
      item: {
        id: "monitoring_monthly",
        name: "Monthly Monitoring",
        description: "Monthly service",
        code: MonitoringInterval.MONTHLY,
        intervalCount: 1,
        checksPerPeriod: 1,
        reportsPerPeriod: 1,
      },
    });
    mockReserveVersions.mockResolvedValue([
      {
        id: "stripe-price-version",
        version: 7,
        provider: PaymentProvider.STRIPE,
        syncStatus: ProviderPriceSyncStatus.READY,
        activeForNewCheckout: true,
      },
      {
        id: "paystack-price-version",
        version: 7,
        provider: PaymentProvider.PAYSTACK,
        syncStatus: ProviderPriceSyncStatus.READY,
        activeForNewCheckout: true,
      },
    ]);
    mockSyncPaystackPlan.mockRejectedValueOnce(new Error("Paystack plan missing local amount"));

    await expect(
      syncProviderPrices({
        target: { monitoringPlanId: "monitoring_monthly" },
        usdAmountCents: 6000,
        ngnAmountKobo: 9000000,
      }),
    ).rejects.toThrow("Paystack plan missing local amount");

    expect(mockUpdateVersionSync).not.toHaveBeenCalledWith(
      "paystack-price-version",
      expect.objectContaining({
        syncStatus: ProviderPriceSyncStatus.FAILED,
      }),
    );
    expect(mockActivateVersions).not.toHaveBeenCalled();
  });
});
