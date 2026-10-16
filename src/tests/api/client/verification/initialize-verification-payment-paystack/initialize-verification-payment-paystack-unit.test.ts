const tx = { transaction: { findFirst: jest.fn(), update: jest.fn(), create: jest.fn() } };
const prisma = {
  verificationRequest: { findUnique: jest.fn(), update: jest.fn() },
  user: { update: jest.fn() },
  transaction: { update: jest.fn(), updateMany: jest.fn() },
  $transaction: jest.fn(async (arg: unknown) =>
    typeof arg === "function"
      ? (arg as (t: typeof tx) => unknown)(tx)
      : Promise.all(arg as unknown[]),
  ),
};
jest.mock("../../../../../utils/prisma", () => ({ prismaClient: prisma }));
jest.mock("../../../../../libs/paystack/paystack", () => ({
  ...jest.requireActual("../../../../../libs/paystack/paystack"),
  createPaystackCustomer: jest.fn(),
  createPaystackSession: jest.fn(),
}));
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

import { initializeVerificationPaymentPaystack } from "../../../../../api/client/verification/handlers/initialize-verification-payment-paystack";
import {
  createPaystackCustomer,
  createPaystackSession,
} from "../../../../../libs/paystack/paystack";
import { callHandler, errorStatus } from "../../../../helpers/http";

const mockedCustomer = createPaystackCustomer as jest.Mock;
const mockedSession = createPaystackSession as jest.Mock;
const env = { ...process.env };
const plan = {
  frequency: "ONE_TIME",
  priceInCents: 500000,
  currency: "NGN",
  paystackPlanCode: null,
};
const verificationRequest = (overrides: object = {}) => ({
  id: "r1",
  userId: "u1",
  status: "DRAFT",
  user: { email: "c@x.com", paystackCustomerCode: "CUS_1" },
  verificationPlan: plan,
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
    process.env = { ...env, PAYSTACK_SECRET_KEY: "sk_live_x" };
    prisma.verificationRequest.findUnique.mockResolvedValue(verificationRequest());
    tx.transaction.findFirst.mockResolvedValue(null);
    tx.transaction.create.mockResolvedValue({ id: "t1" });
    mockedSession.mockResolvedValue({
      reference: "ref_1",
      authorization_url: "https://checkout.paystack.com/1",
      access_code: "ac_1",
    });
  });
  afterAll(() => {
    process.env = env;
  });

  it("reserves a payment, starts a Paystack session and marks the request PENDING_PAYMENT", async () => {
    const { res } = await call();

    expect(tx.transaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        verificationRequestId: "r1",
        amountInCents: 500000,
        status: "PENDING",
      }),
    });
    expect(mockedSession).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "CUS_1",
        amount: 500000,
        currency: "NGN",
        transactionId: "t1",
      }),
    );
    expect(prisma.verificationRequest.update).toHaveBeenCalledWith({
      where: { id: "r1" },
      data: { status: "PENDING_PAYMENT" },
    });
    expect(res.json).toHaveBeenCalledWith({
      authorization_url: "https://checkout.paystack.com/1",
      access_code: "ac_1",
      reference: "ref_1",
    });
  });

  it("creates and saves a Paystack customer the first time", async () => {
    prisma.verificationRequest.findUnique.mockResolvedValue(
      verificationRequest({ user: { email: "c@x.com", paystackCustomerCode: null } }),
    );
    mockedCustomer.mockResolvedValue({ customer_code: "CUS_new" });

    await call();

    expect(mockedCustomer).toHaveBeenCalledWith("c@x.com");
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { paystackCustomerCode: "CUS_new" },
    });
    expect(mockedSession).toHaveBeenCalledWith(expect.objectContaining({ customer: "CUS_new" }));
  });

  it("returns the open checkout instead of starting a second one", async () => {
    tx.transaction.findFirst.mockResolvedValue({
      id: "t0",
      status: "PENDING",
      providerRef: "ref_0",
      authorizationUrl: "https://checkout.paystack.com/0",
      accessCode: "ac_0",
    });

    const { res } = await call();

    expect(mockedSession).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      authorization_url: "https://checkout.paystack.com/0",
      access_code: "ac_0",
      reference: "ref_0",
    });
  });

  it("retries a failed payment on the same transaction", async () => {
    tx.transaction.findFirst.mockResolvedValue({ id: "t0", status: "FAILED" });
    tx.transaction.update.mockResolvedValue({ id: "t0" });
    await call();
    expect(tx.transaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "t0" },
        data: expect.objectContaining({ status: "PENDING" }),
      }),
    );
    expect(tx.transaction.create).not.toHaveBeenCalled();
  });

  it.each([
    ["no user", null, {}, 401],
    ["an unknown request", { id: "u1" }, null, 404],
    ["another client's request", { id: "u1" }, { userId: "u2" }, 403],
    ["a request that isn't payable", { id: "u1" }, { status: "SUBMITTED" }, 409],
    ["no plan selected", { id: "u1" }, { verificationPlan: null }, 400],
    [
      "a recurring plan with no Paystack plan",
      { id: "u1" },
      { verificationPlan: { ...plan, frequency: "MONTHLY" } },
      400,
    ],
  ])("returns the right error for %s", async (_label, user, overrides, status) => {
    prisma.verificationRequest.findUnique.mockResolvedValue(
      overrides === null ? null : verificationRequest(overrides as object),
    );
    expect(errorStatus((await call(user as object | null)).next)).toBe(status);
    expect(mockedSession).not.toHaveBeenCalled();
  });

  it("returns 409 when the request has already been paid", async () => {
    tx.transaction.findFirst.mockResolvedValue({ id: "t0", status: "SUCCESS" });
    const { next } = await call();
    expect(errorStatus(next)).toBe(409);
    expect(next.mock.calls[0][0].message).toBe(
      "This verification request has already been paid for.",
    );
  });

  it("marks the reserved payment FAILED and returns 500 when Paystack fails", async () => {
    mockedSession.mockRejectedValue(
      new Error("Paystack POST /transaction/initialize failed (401)"),
    );

    const { next } = await call();

    expect(errorStatus(next)).toBe(500);
    expect(next.mock.calls[0][0].message).toBe("Unable to initialize payment.");
    expect(prisma.transaction.updateMany).toHaveBeenCalledWith({
      where: { id: "t1", status: "PENDING", providerRef: null },
      data: { status: "FAILED" },
    });
  });
});
