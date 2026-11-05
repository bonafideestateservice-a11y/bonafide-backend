const prisma = {
  verificationRequest: { findFirst: jest.fn() },
  pricingSettings: { findFirst: jest.fn() },
  premiumQuote: { findFirst: jest.fn() },
};

jest.mock("../../../../utils/prisma", () => ({ prismaClient: prisma }));
jest.mock("../../../../api/services/database/pricing", () => {
  const actual = jest.requireActual("../../../../api/services/database/pricing");
  return { ...actual, findVerificationCheckoutPricing: jest.fn() };
});

import { Prisma } from "@prisma/client";
import { getVerificationRequestCheckoutSummary } from "../../../../api/client/verification/handlers/get-verification-request-checkout-summary";
import {
  findVerificationCheckoutPricing,
  PricingRecordError,
} from "../../../../api/services/database/pricing";
import { callHandler } from "../../../helpers/http";

const mockedPricing = findVerificationCheckoutPricing as jest.Mock;
const quote = {
  id: "quote-1",
  status: "ACCEPTED",
  quoteUsdCents: 15000,
  quoteNgnKobo: 22500000,
  usdToNgnRate: new Prisma.Decimal("1500"),
  rateVersion: 3,
  expiresAt: new Date("2026-11-20T10:00:00.000Z"),
};
const request = () => ({
  id: "request-1",
  userId: "client-1",
  user: { countryCode: "NG" },
  verificationTierId: "tier-premium",
  verificationTier: {
    id: "tier-premium",
    code: "PREMIUM",
    name: "Premium",
    quoteRequired: true,
    priceUsdCents: null,
  },
  monitoringPlanId: "plan-monthly",
  monitoringPlan: { name: "Monthly", priceUsdCents: 6000 },
  recurringConsent: true,
});
const call = () =>
  callHandler(getVerificationRequestCheckoutSummary, {
    params: { id: "request-1" },
    user: { id: "client-1" },
  });

describe("getVerificationRequestCheckoutSummary (unit)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.verificationRequest.findFirst.mockResolvedValue(request());
    prisma.pricingSettings.findFirst.mockResolvedValue({
      version: 4,
      usdToNgnRate: new Prisma.Decimal("1600"),
      roundingRule: "NEAREST_KOBO",
    });
    prisma.premiumQuote.findFirst.mockResolvedValue(quote);
    mockedPricing.mockResolvedValue({
      verificationAmountUsdCents: 15000,
      verificationAmountNgnKobo: 22500000,
      monitoringAmountUsdCents: 6000,
      monitoringAmountNgnKobo: 9600000,
      totalUsdCents: 21000,
      totalNgnKobo: 32100000,
      amountMinor: 32100000,
    });
  });

  it("uses the locked quote NGN amount and current-rate monitoring amount", async () => {
    const { res } = await call();
    const body = res.json.mock.calls[0][0];

    expect(body.lineItems).toEqual([
      expect.objectContaining({ type: "VERIFICATION", amountNgnKobo: 22500000 }),
      expect.objectContaining({ type: "MONITORING", amountNgnKobo: 9600000 }),
    ]);
    expect(body.totals).toEqual({ usdCents: 21000, ngnKobo: 32100000 });
    expect(body.charge).toEqual({
      amountMinor: 32100000,
      currency: "NGN",
      display: "NGN 32100000",
    });
    expect(body.canInitializePayment).toBe(true);
    expect(mockedPricing).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "PAYSTACK", requestId: "request-1" }),
    );
  });

  it("disables payment when pricing validation rejects an expired quote", async () => {
    mockedPricing.mockRejectedValue(
      new PricingRecordError("QUOTE_EXPIRED", "The accepted Premium quote has expired"),
    );

    const { res } = await call();
    const body = res.json.mock.calls[0][0];

    expect(body.canInitializePayment).toBe(false);
    expect(body.paymentUnavailableReason).toBe("The accepted Premium quote has expired");
    expect(body.charge.amountMinor).toBe(32100000);
  });
});
