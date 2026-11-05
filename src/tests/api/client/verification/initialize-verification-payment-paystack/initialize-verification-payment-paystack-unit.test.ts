const prisma = {
  verificationRequest: { findUnique: jest.fn(), updateMany: jest.fn() },
  user: { update: jest.fn() },
  transaction: { update: jest.fn(), updateMany: jest.fn() },
  $transaction: jest.fn(async (arg: unknown) =>
    Array.isArray(arg) ? Promise.all(arg) : undefined,
  ),
};
jest.mock("../../../../../utils/prisma", () => ({ prismaClient: prisma }));
jest.mock("../../../../../libs/paystack/paystack", () => ({
  ...jest.requireActual("../../../../../libs/paystack/paystack"),
  createPaystackCustomer: jest.fn(),
  createPaystackSession: jest.fn(),
}));
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
import { initializeVerificationPaymentPaystack } from "../../../../../api/client/verification/handlers/initialize-verification-payment-paystack";
import {
  findVerificationCheckoutPricing,
  PricingRecordError,
  reservePricedTransaction,
} from "../../../../../api/services/database/pricing";
import {
  createPaystackCustomer,
  createPaystackSession,
} from "../../../../../libs/paystack/paystack";
import { callHandler, errorStatus } from "../../../../helpers/http";

const mockedCustomer = createPaystackCustomer as jest.Mock;
const mockedSession = createPaystackSession as jest.Mock;
const mockedPricing = findVerificationCheckoutPricing as jest.Mock;
const mockedReservation = reservePricedTransaction as jest.Mock;
const pricing = (overrides: object = {}) => ({
  request: {
    id: "r1",
    verificationTier: { name: "Standard" },
    monitoringPlan: null,
    user: {
      email: "c@example.com",
      countryCode: "NG",
      paystackCustomerCode: "CUS_1",
    },
  },
  tierPriceVersion: null,
  monitoringPriceVersion: null,
  verificationAmountUsdCents: 6000,
  verificationAmountNgnKobo: 9000000,
  monitoringAmountUsdCents: 0,
  monitoringAmountNgnKobo: 0,
  totalUsdCents: 6000,
  totalNgnKobo: 9000000,
  amountMinor: 9000000,
  currency: "NGN",
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
  callHandler(initializeVerificationPaymentPaystack, {
    params: { id: "r1" },
    user: user ?? undefined,
  });

describe("initializeVerificationPaymentPaystack (unit)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.PAYSTACK_SECRET_KEY = "sk_live_x";
    prisma.verificationRequest.findUnique.mockResolvedValue(request());
    mockedPricing.mockResolvedValue(pricing());
    mockedReservation.mockResolvedValue({
      transaction: { id: "t1", authorizationUrl: null, providerRef: null },
      reused: false,
    });
    mockedSession.mockResolvedValue({
      reference: "ref_1",
      authorization_url: "https://checkout.paystack.com/1",
      access_code: "ac_1",
    });
  });

  it("charges the package and first period and attaches the selected monitoring plan", async () => {
    mockedPricing.mockResolvedValue(
      pricing({
        request: {
          id: "r1",
          verificationTier: { name: "Standard" },
          monitoringPlan: { name: "Monthly" },
          user: {
            email: "c@example.com",
            countryCode: "NG",
            paystackCustomerCode: "CUS_1",
          },
        },
        monitoringPriceVersion: { providerPriceId: "PLN_monthly" },
        monitoringAmountUsdCents: 6000,
        monitoringAmountNgnKobo: 9000000,
        totalUsdCents: 12000,
        totalNgnKobo: 18000000,
        amountMinor: 18000000,
      }),
    );

    const { res } = await call();

    expect(mockedPricing).toHaveBeenCalledWith({
      requestId: "r1",
      userId: "u1",
      provider: "PAYSTACK",
    });
    expect(mockedSession).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "CUS_1",
        amount: 18000000,
        currency: "NGN",
        plan: "PLN_monthly",
        transactionId: "t1",
      }),
    );
    expect(prisma.transaction.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: {
        providerRef: "ref_1",
        authorizationUrl: "https://checkout.paystack.com/1",
        accessCode: "ac_1",
      },
    });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        authorization_url: "https://checkout.paystack.com/1",
        reference: "ref_1",
        transactionId: "t1",
      }),
    );
  });

  it("creates and saves a Paystack customer when the profile has none", async () => {
    mockedPricing.mockResolvedValue(
      pricing({
        request: {
          id: "r1",
          verificationTier: { name: "Standard" },
          monitoringPlan: null,
          user: {
            email: "c@example.com",
            countryCode: "NG",
            paystackCustomerCode: null,
          },
        },
      }),
    );
    mockedCustomer.mockResolvedValue({ customer_code: "CUS_new" });

    await call();

    expect(mockedCustomer).toHaveBeenCalledWith("c@example.com");
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { paystackCustomerCode: "CUS_new" },
    });
    expect(mockedSession).toHaveBeenCalledWith(expect.objectContaining({ customer: "CUS_new" }));
  });

  it("reuses a matching open checkout", async () => {
    mockedReservation.mockResolvedValue({
      transaction: {
        id: "t0",
        status: "PENDING",
        currency: "NGN",
        providerRef: "ref_0",
        authorizationUrl: "https://checkout.paystack.com/0",
        accessCode: "ac_0",
      },
      reused: true,
    });
    const { res } = await call();

    expect(mockedSession).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        authorization_url: "https://checkout.paystack.com/0",
        reference: "ref_0",
      }),
    );
  });

  it.each([
    ["no user", null, {}, 401],
    ["an unknown request", { id: "u1" }, null, 404],
    ["another client's request", { id: "u1" }, { userId: "u2" }, 403],
    ["a request that isn't payable", { id: "u1" }, { status: "SUBMITTED" }, 409],
  ])("returns the right error for %s", async (_label, user, overrides, status) => {
    prisma.verificationRequest.findUnique.mockResolvedValue(
      overrides === null ? null : request(overrides as object),
    );
    expect(errorStatus((await call(user as object | null)).next)).toBe(status);
    expect(mockedSession).not.toHaveBeenCalled();
  });

  it("rejects checkout if provider pricing is not synchronized", async () => {
    mockedPricing.mockRejectedValue(
      new PricingRecordError("INVALID_SELECTION", "Monitoring plan is not synchronized"),
    );
    const { next } = await call();
    expect(errorStatus(next)).toBe(400);
    expect(mockedSession).not.toHaveBeenCalled();
  });

  it("marks the reserved payment FAILED and returns 500 when Paystack fails", async () => {
    mockedSession.mockRejectedValue(new Error("Paystack down"));

    const { next } = await call();

    expect(errorStatus(next)).toBe(500);
    expect(prisma.transaction.updateMany).toHaveBeenCalledWith({
      where: { id: "t1", status: "PENDING", providerRef: null },
      data: { status: "FAILED" },
    });
  });
});
