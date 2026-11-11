const mockGetCatalogue = jest.fn();

jest.mock("../../../../api/services/database/pricing", () => ({
  getVerificationPricingCatalogue: (...args: unknown[]) => mockGetCatalogue(...args),
}));
jest.mock("../../../../utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

import { getVerificationPricingCatalog } from "../../../../api/client/verification/handlers/get-verification-pricing-catalog";
import { callHandler } from "../../../helpers/http";
import { Prisma } from "@prisma/client";

describe("getVerificationPricingCatalog handler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns configured package features and Premium quote bounds", async () => {
    mockGetCatalogue.mockResolvedValue({
      tiers: [
        {
          id: "tier-premium",
          code: "PREMIUM",
          name: "Premium",
          description: "Premium package",
          features: ["Valuation", "Feasibility report"],
          priceUsdCents: null,
          quoteRequired: true,
          minQuoteUsdCents: 10000,
          maxQuoteUsdCents: 20000,
        },
      ],
      monitoringPlans: [],
      pricingSettings: { usdToNgnRate: new Prisma.Decimal("1500") },
    });

    const { res, next } = await callHandler(getVerificationPricingCatalog);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tiers: [
            expect.objectContaining({
              features: ["Valuation", "Feasibility report"],
              minQuoteUsdCents: 10000,
              maxQuoteUsdCents: 20000,
              priceNgnKobo: null,
            }),
          ],
        }),
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });
});
