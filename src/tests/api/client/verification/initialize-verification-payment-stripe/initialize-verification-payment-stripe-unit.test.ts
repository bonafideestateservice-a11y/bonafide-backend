const tx = { transaction: { findFirst: jest.fn(), update: jest.fn(), create: jest.fn() } };
const prisma = {
  verificationRequest: { findUnique: jest.fn(), update: jest.fn() },
  transaction: { update: jest.fn(), updateMany: jest.fn() },
  $transaction: jest.fn(async (arg: unknown) =>
    typeof arg === "function"
      ? (arg as (t: typeof tx) => unknown)(tx)
      : Promise.all(arg as unknown[]),
  ),
};
jest.mock("../../../../../utils/prisma", () => ({ prismaClient: prisma }));
jest.mock("../../../../../libs/stripe/stripe", () => ({ createStripeSession: jest.fn() }));
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

import { initializeVerificationPaymentStripe } from "../../../../../api/client/verification/handlers/initialize-verification-payment-stripe";
import { createStripeSession } from "../../../../../libs/stripe/stripe";
import { callHandler, errorStatus } from "../../../../helpers/http";

const mockedSession = createStripeSession as jest.Mock;
const plan = {
  frequency: "ONE_TIME",
  priceInCents: 4500,
  currency: "USD",
  stripePriceId: "price_1",
};
const verificationRequest = (overrides: object = {}) => ({
  id: "r1",
  userId: "u1",
  status: "DRAFT",
  verificationPlan: plan,
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
    prisma.verificationRequest.findUnique.mockResolvedValue(verificationRequest());
    tx.transaction.findFirst.mockResolvedValue(null);
    tx.transaction.create.mockResolvedValue({ id: "t1", authorizationUrl: null });
    mockedSession.mockResolvedValue("https://checkout.stripe.com/c/pay/cs_1");
  });

  it("starts a one-time Stripe checkout and returns its URL", async () => {
    const { res } = await call();

    expect(mockedSession).toHaveBeenCalledWith({
      priceId: "price_1",
      mode: "payment",
      metadata: expect.objectContaining({
        userId: "u1",
        verificationRequestId: "r1",
        transactionId: "t1",
      }),
    });
    expect(prisma.transaction.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { authorizationUrl: "https://checkout.stripe.com/c/pay/cs_1" },
    });
    expect(prisma.verificationRequest.update).toHaveBeenCalledWith({
      where: { id: "r1" },
      data: { status: "PENDING_PAYMENT" },
    });
    expect(res.json).toHaveBeenCalledWith({ url: "https://checkout.stripe.com/c/pay/cs_1" });
  });

  it("uses subscription mode for recurring plans", async () => {
    prisma.verificationRequest.findUnique.mockResolvedValue(
      verificationRequest({ verificationPlan: { ...plan, frequency: "MONTHLY" } }),
    );
    await call();
    expect(mockedSession).toHaveBeenCalledWith(expect.objectContaining({ mode: "subscription" }));
  });

  it("returns the open checkout instead of starting a second one", async () => {
    tx.transaction.findFirst.mockResolvedValue({
      id: "t0",
      status: "PENDING",
      authorizationUrl: "https://checkout.stripe.com/c/pay/cs_0",
    });
    const { res } = await call();
    expect(mockedSession).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ url: "https://checkout.stripe.com/c/pay/cs_0" });
  });

  it.each([
    ["no user", null, {}, 401],
    ["an unknown request", { id: "u1" }, null, 404],
    ["another client's request", { id: "u1" }, { userId: "u2" }, 403],
    ["a request that isn't payable", { id: "u1" }, { status: "COMPLETED" }, 409],
    ["no plan selected", { id: "u1" }, { verificationPlan: null }, 400],
    [
      "a plan not set up in Stripe",
      { id: "u1" },
      { verificationPlan: { ...plan, stripePriceId: null } },
      400,
    ],
  ])("returns the right error for %s", async (_label, user, overrides, status) => {
    prisma.verificationRequest.findUnique.mockResolvedValue(
      overrides === null ? null : verificationRequest(overrides as object),
    );
    expect(errorStatus((await call(user as object | null)).next)).toBe(status);
    expect(mockedSession).not.toHaveBeenCalled();
  });

  it("returns 409 when the request has already been paid or a payment is mid-start", async () => {
    tx.transaction.findFirst.mockResolvedValueOnce({ id: "t0", status: "SUCCESS" });
    expect(errorStatus((await call()).next)).toBe(409);
    tx.transaction.findFirst.mockResolvedValueOnce({
      id: "t0",
      status: "PENDING",
      authorizationUrl: null,
    });
    const { next } = await call();
    expect(next.mock.calls[0][0].message).toBe(
      "A payment is already being initialized for this request.",
    );
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
