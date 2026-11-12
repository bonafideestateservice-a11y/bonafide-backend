const prisma = {
  verificationRequest: { findUnique: jest.fn() },
  premiumQuote: { findFirst: jest.fn() },
  pricingSettings: { findFirst: jest.fn() },
};
const mockIssuePremiumQuote = jest.fn();
const mockAcceptPremiumQuote = jest.fn();
const mockFindPremiumQuote = jest.fn();
const mockStripeCheckout = jest.fn();
const mockPaystackCheckout = jest.fn();
const mockEnqueueNotification = jest.fn();

jest.mock("../../../../utils/prisma", () => ({ prismaClient: prisma }));
jest.mock("../../../../utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock("../../../../jobs/notifications/queue", () => ({
  enqueueNotificationEvent: (...args: unknown[]) => mockEnqueueNotification(...args),
}));
jest.mock("../../../../api/services/database/pricing", () => ({
  issuePremiumQuote: (...args: unknown[]) => mockIssuePremiumQuote(...args),
  acceptPremiumQuote: (...args: unknown[]) => mockAcceptPremiumQuote(...args),
  findPremiumQuoteForUser: (...args: unknown[]) => mockFindPremiumQuote(...args),
  PricingRecordError: class PricingRecordError extends Error {},
}));
jest.mock("../../../../api/client/verification/services/verification-checkout", () => ({
  createStripeVerificationCheckout: (...args: unknown[]) => mockStripeCheckout(...args),
  createPaystackVerificationCheckout: (...args: unknown[]) => mockPaystackCheckout(...args),
}));

import { PaymentProvider, Prisma } from "@prisma/client";
import { issueVerificationRequestQuote } from "../../../../api/admin/verification/handlers/issue-verification-request-quote";
import { getVerificationRequestQuote } from "../../../../api/client/verification/handlers/get-verification-request-quote";
import { acceptVerificationRequestQuote } from "../../../../api/client/verification/handlers/accept-verification-request-quote";
import { AppEventTypes } from "../../../../events";
import { callHandler } from "../../../helpers/http";

const issuedQuote = {
  id: "quote-1",
  verificationRequestId: "request-1",
  status: "ISSUED",
  quoteUsdCents: 15000,
  quoteNgnKobo: 22500000,
  usdToNgnRate: new Prisma.Decimal("1500"),
  rateVersion: 3,
  scopeSummary: "Valuation and feasibility assessment",
  expiresAt: new Date("2026-11-18T23:59:59.000Z"),
  createdAt: new Date("2026-11-04T20:30:00.000Z"),
  verificationRequest: {
    intendedUse: "Residential rental investment",
    additionalNote: "Include a valuation of the existing structure.",
  },
};

describe("Premium quote notification flows", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CLIENT_APP_URL = "https://client.example.com";
    prisma.verificationRequest.findUnique.mockResolvedValue({
      id: "request-1",
      userId: "user-1",
      user: { countryCode: "NG" },
      verificationTier: { description: "Premium verification scope" },
    });
    prisma.premiumQuote.findFirst.mockResolvedValue({ id: "quote-1" });
    prisma.pricingSettings.findFirst.mockResolvedValue({
      id: "settings-1",
      version: 3,
      usdToNgnRate: new Prisma.Decimal("1500"),
    });
    mockIssuePremiumQuote.mockResolvedValue(issuedQuote);
    mockFindPremiumQuote.mockResolvedValue(issuedQuote);
    mockAcceptPremiumQuote.mockResolvedValue({
      quote: { ...issuedQuote, status: "ACCEPTED", acceptedAt: new Date() },
      acceptedNow: true,
    });
    mockPaystackCheckout.mockResolvedValue({
      provider: PaymentProvider.PAYSTACK,
      checkoutUrl: "https://checkout.paystack.com/session-1",
      reference: "ref-1",
      transactionId: "txn-1",
      pricing: { currency: "NGN" },
    });
    mockEnqueueNotification.mockResolvedValue(undefined);
  });

  it("queues a client review email after issuing the quote", async () => {
    const { res, next } = await callHandler(issueVerificationRequestQuote, {
      params: { id: "request-1" },
      body: {
        amountUsdCents: 15000,
        scopeSummary: "Valuation and feasibility assessment",
        expiresAt: "2026-11-18T23:59:59.000Z",
      },
      user: { id: "admin-1" },
    });

    expect(mockEnqueueNotification).toHaveBeenCalledWith(AppEventTypes.PREMIUM_QUOTE_ISSUED, {
      quoteId: "quote-1",
      reviewUrl: "https://client.example.com/verification-requests/request-1/quote",
    });
    expect(mockIssuePremiumQuote).toHaveBeenCalledWith(
      expect.objectContaining({ scopeSummary: "Valuation and feasibility assessment" }),
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ notification: { emailStatus: "QUEUED" } }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("returns the saved Premium quote scope summary to the client", async () => {
    mockFindPremiumQuote.mockResolvedValueOnce({
      ...issuedQuote,
      verificationTier: { description: "Generic Premium description" },
    });

    const { res, next } = await callHandler(getVerificationRequestQuote, {
      params: { id: "request-1" },
      user: { id: "user-1" },
    });

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        scopeSummary: "Valuation and feasibility assessment",
        intendedUse: "Residential rental investment",
        notes: "Include a valuation of the existing structure.",
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("creates and emails a country-selected hosted checkout after acceptance", async () => {
    const { res, next } = await callHandler(acceptVerificationRequestQuote, {
      params: { id: "request-1" },
      body: { quoteId: "quote-1" },
      user: { id: "user-1" },
    });

    expect(mockPaystackCheckout).toHaveBeenCalledWith("request-1", "user-1");
    expect(mockStripeCheckout).not.toHaveBeenCalled();
    expect(mockEnqueueNotification).toHaveBeenCalledWith(AppEventTypes.PREMIUM_QUOTE_ACCEPTED, {
      quoteId: "quote-1",
      provider: "PAYSTACK",
      currency: "NGN",
      checkoutUrl: "https://checkout.paystack.com/session-1",
    });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        payment: expect.objectContaining({
          checkoutUrl: "https://checkout.paystack.com/session-1",
          status: "PENDING",
        }),
        notification: { emailStatus: "QUEUED" },
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("uses Stripe for a non-Nigerian client's accepted quote", async () => {
    prisma.verificationRequest.findUnique.mockResolvedValue({
      id: "request-1",
      userId: "user-1",
      user: { countryCode: "US" },
    });
    mockStripeCheckout.mockResolvedValue({
      provider: PaymentProvider.STRIPE,
      checkoutUrl: "https://checkout.stripe.com/session-1",
      reference: "cs-1",
      sessionId: "cs-1",
      transactionId: "txn-1",
      pricing: { currency: "USD" },
    });

    await callHandler(acceptVerificationRequestQuote, {
      params: { id: "request-1" },
      body: { quoteId: "quote-1" },
      user: { id: "user-1" },
    });

    expect(mockStripeCheckout).toHaveBeenCalledWith("request-1", "user-1");
    expect(mockPaystackCheckout).not.toHaveBeenCalled();
    expect(mockEnqueueNotification).toHaveBeenCalledWith(
      AppEventTypes.PREMIUM_QUOTE_ACCEPTED,
      expect.objectContaining({
        provider: "STRIPE",
        currency: "USD",
        checkoutUrl: "https://checkout.stripe.com/session-1",
      }),
    );
  });

  it("reports notification queue failures after preserving quote acceptance", async () => {
    mockEnqueueNotification.mockRejectedValueOnce(new Error("queue unavailable"));

    const { next } = await callHandler(acceptVerificationRequestQuote, {
      params: { id: "request-1" },
      body: { quoteId: "quote-1" },
      user: { id: "user-1" },
    });

    expect(mockAcceptPremiumQuote).toHaveBeenCalledWith({
      quoteId: "quote-1",
      userId: "user-1",
    });
    expect(mockPaystackCheckout).toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 500 }));
  });
});
