const prisma = {
  verificationRequest: { findUnique: jest.fn(), updateMany: jest.fn() },
  transaction: { update: jest.fn(), updateMany: jest.fn() },
  $transaction: jest.fn(async (arg: unknown) =>
    Array.isArray(arg) ? Promise.all(arg) : undefined,
  ),
};
jest.mock("../../../../../utils/prisma", () => ({ prismaClient: prisma }));
jest.mock("../../../../../libs/stripe/stripe", () => ({ createStripeSession: jest.fn() }));
jest.mock("../../../../../api/services/database/pricing", () => {
  const actual = jest.requireActual("../../../../../api/services/database/pricing");
  return {
    ...actual,
    findVerificationCheckoutPricing: jest.fn(),
    createVerificationCheckoutTransactionData: jest.fn(() => ({ verificationRequestId: "r1" })),
    reservePricedTransaction: jest.fn(),
  };
});
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

import { VerificationStatus } from "@prisma/client";
import { initializeVerificationPaymentStripe } from "../../../../../api/client/verification/handlers/initialize-verification-payment-stripe";
import {
  createVerificationCheckoutTransactionData,
  findVerificationCheckoutPricing,
  PricingRecordError,
  reservePricedTransaction,
} from "../../../../../api/services/database/pricing";
import { createStripeSession } from "../../../../../libs/stripe/stripe";
import { callHandler, errorStatus } from "../../../../helpers/http";

const mockedSession = createStripeSession as jest.Mock;
const mockedPricing = findVerificationCheckoutPricing as jest.Mock;
const mockedTransactionData = createVerificationCheckoutTransactionData as jest.Mock;
const mockedReservation = reservePricedTransaction as jest.Mock;
const pricing = (overrides: object = {}) => ({
  request: {
    id: "r1",
    verificationTier: { name: "Standard" },
    monitoringPlan: null,
    user: { email: "c@example.com" },
  },
  tierPriceVersion: { providerPriceId: "price_standard" },
  monitoringPriceVersion: null,
  verificationAmountUsdCents: 6000,
  verificationAmountNgnKobo: 9000000,
  monitoringAmountUsdCents: 0,
  monitoringAmountNgnKobo: 0,
  totalUsdCents: 6000,
  totalNgnKobo: 9000000,
  amountMinor: 6000,
  currency: "USD",
  pricingSettings: null,
  quote: null,
  ...overrides,
});
const request = (overrides: object = {}) => ({
  userId: "u1",
  status: VerificationStatus.DRAFT,
  ...overrides,
});
const call = (user: object | null = { id: "u1" }) =>
  callHandler(initializeVerificationPaymentStripe, {
    params: { id: "r1" },
    user: user ?? undefined,
  });

describe("initializeVerificationPaymentStripe (unit)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.verificationRequest.findUnique.mockResolvedValue(request());
    mockedPricing.mockResolvedValue(pricing());
    mockedTransactionData.mockReturnValue({ verificationRequestId: "r1" });
    mockedReservation.mockResolvedValue({
      transaction: { id: "t1", authorizationUrl: null, providerRef: null },
      reused: false,
    });
    mockedSession.mockResolvedValue({
      id: "cs_1",
      url: "https://checkout.stripe.com/c/pay/cs_1",
    });
  });

  it("creates a Stripe session with the active fixed-price package", async () => {
    const { res } = await call();

    expect(mockedPricing).toHaveBeenCalledWith({
      requestId: "r1",
      userId: "u1",
      provider: "STRIPE",
    });
    expect(mockedSession).toHaveBeenCalledWith({
      lineItems: [{ price: "price_standard", quantity: 1 }],
      mode: "payment",
      metadata: expect.objectContaining({
        userId: "u1",
        verificationRequestId: "r1",
        transactionId: "t1",
      }),
    });
    expect(prisma.transaction.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: {
        providerRef: "cs_1",
        authorizationUrl: "https://checkout.stripe.com/c/pay/cs_1",
      },
    });
    expect(prisma.verificationRequest.updateMany).toHaveBeenCalledWith({
      where: { id: "r1", status: { in: expect.any(Array) } },
      data: { status: "PENDING_PAYMENT" },
    });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://checkout.stripe.com/c/pay/cs_1",
        sessionId: "cs_1",
        transactionId: "t1",
      }),
    );
  });

  it("uses a one-time package and recurring monitoring price in subscription mode", async () => {
    mockedPricing.mockResolvedValue(
      pricing({
        request: {
          id: "r1",
          verificationTier: { name: "Standard" },
          monitoringPlan: { name: "Monthly" },
          user: { email: "c@example.com" },
        },
        monitoringPriceVersion: { providerPriceId: "price_monthly" },
        monitoringAmountUsdCents: 6000,
      }),
    );

    await call();

    expect(mockedSession).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "subscription",
        lineItems: [
          { price: "price_standard", quantity: 1 },
          { price: "price_monthly", quantity: 1 },
        ],
      }),
    );
  });

  it("reuses a matching open checkout", async () => {
    mockedReservation.mockResolvedValue({
      transaction: {
        id: "t0",
        status: "PENDING",
        currency: "USD",
        providerRef: "cs_0",
        authorizationUrl: "https://checkout.stripe.com/c/pay/cs_0",
      },
      reused: true,
    });
    const { res } = await call();

    expect(mockedSession).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://checkout.stripe.com/c/pay/cs_0",
        sessionId: "cs_0",
      }),
    );
  });

  it.each([
    ["no user", null, {}, 401],
    ["an unknown request", { id: "u1" }, null, 404],
    ["another client's request", { id: "u1" }, { userId: "u2" }, 403],
    ["a request that isn't payable", { id: "u1" }, { status: "COMPLETED" }, 409],
  ])("returns the right error for %s", async (_label, user, overrides, status) => {
    prisma.verificationRequest.findUnique.mockResolvedValue(
      overrides === null ? null : request(overrides as object),
    );
    expect(errorStatus((await call(user as object | null)).next)).toBe(status);
    expect(mockedSession).not.toHaveBeenCalled();
  });

  it("rejects a checkout when the pricing service reports a missing accepted quote", async () => {
    mockedPricing.mockRejectedValue(
      new PricingRecordError("INVALID_STATE", "An accepted Premium quote is required"),
    );
    const { next } = await call();
    expect(errorStatus(next)).toBe(409);
    expect(mockedSession).not.toHaveBeenCalled();
  });

  it("marks the reserved payment FAILED and returns 500 when Stripe fails", async () => {
    mockedSession.mockRejectedValue(new Error("stripe down"));
    const { next } = await call();
    expect(errorStatus(next)).toBe(500);
    expect(prisma.transaction.updateMany).toHaveBeenCalledWith({
      where: { id: "t1", status: "PENDING", providerRef: null },
      data: { status: "FAILED" },
    });
  });
});
