const constructEvent = jest.fn();
const retrieveSubscription = jest.fn();
const tx = { transaction: { updateMany: jest.fn() } };
const prismaMock = {
  webhookEvent: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn() },
  transaction: { findUnique: jest.fn(), findFirst: jest.fn(), upsert: jest.fn() },
  stripeSubscription: { findUnique: jest.fn(), update: jest.fn(), upsert: jest.fn() },
  $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
};
const lifecycle = {
  markRequestPaid: jest.fn(),
  markRequestPaymentFailed: jest.fn(),
  completeRequestIfFinished: jest.fn(),
};

jest.mock("../../../../libs/stripe", () => ({
  getStripeClient: () => ({
    webhooks: { constructEvent },
    subscriptions: { retrieve: retrieveSubscription },
  }),
}));
jest.mock("../../../../utils/prisma", () => ({ prismaClient: prismaMock }));
jest.mock("../../../../api/services/database/verification-lifecycle", () => lifecycle);
jest.mock("../../../../events", () => ({
  appEvents: { emit: jest.fn() },
  AppEventTypes: { PAYMENT_RECEIVED: "PAYMENT_RECEIVED" },
}));
jest.mock("../../../../utils/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { Request, Response } from "express";
import { stripeWebhook } from "../../../../api/webhooks/stripe";

const buildReqRes = (headers: Record<string, string> = { "stripe-signature": "sig" }) => {
  const req = { headers, rawBody: Buffer.from("{}") } as unknown as Request;
  const res = {
    sendStatus: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
  return { req, res };
};

const run = async (type: string, object: object) => {
  constructEvent.mockReturnValue({ id: "evt_1", type, data: { object } });
  const { req, res } = buildReqRes();
  await stripeWebhook(req, res);
  return res;
};

const storedSubscription = { verificationRequestId: "vr-1", subscriptionId: "sub_1" };
const subscription = (status: string) => ({
  id: "sub_1",
  status,
  metadata: {},
  items: { data: [{ price: { id: "price_1" }, current_period_end: 1, current_period_start: 1 }] },
});

describe("stripeWebhook (unit)", () => {
  beforeAll(() => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_unit";
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.webhookEvent.findUnique.mockResolvedValue(null);
    prismaMock.stripeSubscription.findUnique.mockResolvedValue(storedSubscription);
  });

  it("rejects a request without a signature", async () => {
    const { req, res } = buildReqRes({});

    await stripeWebhook(req, res);

    expect(res.sendStatus).toHaveBeenCalledWith(400);
    expect(constructEvent).not.toHaveBeenCalled();
  });

  it("rejects an invalid signature", async () => {
    constructEvent.mockImplementation(() => {
      throw new Error("No signatures found");
    });
    const { req, res } = buildReqRes();

    await stripeWebhook(req, res);

    expect(res.sendStatus).toHaveBeenCalledWith(400);
    expect(prismaMock.webhookEvent.upsert).not.toHaveBeenCalled();
  });

  it("skips events that were already processed", async () => {
    prismaMock.webhookEvent.findUnique.mockResolvedValue({ processed: true });

    const res = await run("invoice.paid", { id: "in_1", subscription: "sub_1" });

    expect(res.json).toHaveBeenCalledWith({ received: true });
    expect(prismaMock.transaction.upsert).not.toHaveBeenCalled();
  });

  it("checkout.session.completed marks the payment successful and the request paid", async () => {
    const metadata = {
      userId: "user-1",
      verificationRequestId: "vr-1",
      transactionId: "txn-1",
      description: "One-time",
    };
    prismaMock.transaction.findUnique
      .mockResolvedValueOnce({ id: "txn-1", verificationRequestId: "vr-1" })
      .mockResolvedValueOnce(null);

    await run("checkout.session.completed", { id: "cs_1", metadata, subscription: null });

    expect(tx.transaction.updateMany).toHaveBeenCalledWith({
      where: { id: "txn-1", status: { not: "SUCCESS" } },
      data: expect.objectContaining({ status: "SUCCESS", providerRef: "cs_1" }),
    });
    expect(lifecycle.markRequestPaid).toHaveBeenCalledWith(tx, "vr-1");
    expect(retrieveSubscription).not.toHaveBeenCalled();
  });

  it("invoice.paid records the renewal and marks the request paid", async () => {
    prismaMock.transaction.upsert.mockResolvedValue({ id: "txn-2", verificationRequestId: "vr-1" });

    await run("invoice.paid", {
      id: "in_1",
      subscription: "sub_1",
      billing_reason: "subscription_cycle",
      amount_paid: 500000,
      currency: "ngn",
      created: 1,
    });

    expect(prismaMock.transaction.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { providerRef: "in_1" },
        create: expect.objectContaining({ verificationRequestId: "vr-1", status: "SUCCESS" }),
      }),
    );
    expect(lifecycle.markRequestPaid).toHaveBeenCalledWith(prismaMock, "vr-1");
  });

  it("invoice.payment_failed flags the payment but keeps the subscription active", async () => {
    await run("invoice.payment_failed", { id: "in_1", subscription: "sub_1" });

    expect(lifecycle.markRequestPaymentFailed).toHaveBeenCalledWith(prismaMock, "vr-1");
    expect(prismaMock.stripeSubscription.update).not.toHaveBeenCalled();
  });

  describe("customer.subscription.updated", () => {
    it("keeps a past_due subscription active", async () => {
      await run("customer.subscription.updated", subscription("past_due"));

      expect(prismaMock.stripeSubscription.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "ACTIVE" }) }),
      );
      expect(lifecycle.markRequestPaymentFailed).not.toHaveBeenCalled();
      expect(lifecycle.completeRequestIfFinished).not.toHaveBeenCalled();
    });

    it("marks the payment failed when the subscription becomes unpaid", async () => {
      await run("customer.subscription.updated", subscription("unpaid"));

      expect(prismaMock.stripeSubscription.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "INACTIVE" }) }),
      );
      expect(lifecycle.markRequestPaymentFailed).toHaveBeenCalledWith(prismaMock, "vr-1");
    });

    it("completes the request when the subscription is canceled", async () => {
      await run("customer.subscription.updated", subscription("canceled"));

      expect(lifecycle.completeRequestIfFinished).toHaveBeenCalledWith(prismaMock, "vr-1");
      expect(lifecycle.markRequestPaymentFailed).not.toHaveBeenCalled();
    });
  });

  it("customer.subscription.deleted ends the subscription and completes the request", async () => {
    await run("customer.subscription.deleted", subscription("canceled"));

    expect(prismaMock.stripeSubscription.update).toHaveBeenCalledWith({
      where: { subscriptionId: "sub_1" },
      data: { status: "INACTIVE" },
    });
    expect(lifecycle.completeRequestIfFinished).toHaveBeenCalledWith(prismaMock, "vr-1");
  });

  it("returns 500 so Stripe retries when handling fails", async () => {
    prismaMock.stripeSubscription.findUnique.mockRejectedValue(new Error("database down"));

    const res = await run("invoice.payment_failed", { id: "in_1", subscription: "sub_1" });

    expect(res.sendStatus).toHaveBeenCalledWith(500);
    expect(prismaMock.webhookEvent.update).not.toHaveBeenCalled();
  });
});
