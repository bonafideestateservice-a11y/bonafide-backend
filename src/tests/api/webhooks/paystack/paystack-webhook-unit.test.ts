const tx = { transaction: { updateMany: jest.fn() } };
const prismaMock = {
  webhookEvent: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn() },
  transaction: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
  paystackSubscription: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    upsert: jest.fn(),
    updateMany: jest.fn(),
  },
  user: { findUnique: jest.fn() },
  verificationPlan: { findUnique: jest.fn() },
  $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
};
const lifecycle = {
  markRequestPaid: jest.fn(),
  markRequestPaymentFailed: jest.fn(),
  completeRequestIfFinished: jest.fn(),
};

jest.mock("../../../../utils/prisma", () => ({ prismaClient: prismaMock }));
jest.mock("../../../../api/services/database/verification-lifecycle", () => lifecycle);
jest.mock("../../../../events", () => ({
  appEvents: { emit: jest.fn() },
  AppEventTypes: { PAYMENT_RECEIVED: "PAYMENT_RECEIVED" },
}));
jest.mock("../../../../utils/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import crypto from "crypto";
import { NextFunction, Request, Response } from "express";
import { paystackWebhook } from "../../../../api/webhooks/paystack";
import { appEvents } from "../../../../events";

const SECRET = "paystack-unit-secret";

const buildReqRes = (body: object, secret = SECRET) => {
  const signature = crypto.createHmac("sha512", secret).update(JSON.stringify(body)).digest("hex");
  const req = { headers: { "x-paystack-signature": signature }, body } as unknown as Request;
  const res = {
    sendStatus: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
  return { req, res, next: jest.fn() as NextFunction };
};

const run = async (body: object, secret?: string) => {
  const { req, res, next } = buildReqRes(body, secret);
  await paystackWebhook(req, res, next);
  return res;
};

describe("paystackWebhook (unit)", () => {
  beforeAll(() => {
    process.env.PAYSTACK_SECRET_KEY = SECRET;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.webhookEvent.findUnique.mockResolvedValue(null);
    prismaMock.transaction.findUnique.mockResolvedValue(null);
  });

  it("rejects an invalid signature without storing the event", async () => {
    const res = await run({ event: "charge.success", data: { reference: "ref-1" } }, "wrong");

    expect(res.sendStatus).toHaveBeenCalledWith(400);
    expect(prismaMock.webhookEvent.upsert).not.toHaveBeenCalled();
  });

  it("skips events that were already processed", async () => {
    prismaMock.webhookEvent.findUnique.mockResolvedValue({ processed: true });

    const res = await run({ event: "charge.success", data: { reference: "ref-1" } });

    expect(res.json).toHaveBeenCalledWith({ received: true });
    expect(prismaMock.transaction.findFirst).not.toHaveBeenCalled();
  });

  describe("event IDs", () => {
    it.each([
      [
        "subscription events by type and subscription code",
        { event: "subscription.disable", data: { subscription_code: "SUB_1" } },
        "subscription.disable:SUB_1",
      ],
      [
        "invoices by invoice code, not their subscription",
        {
          event: "invoice.payment_failed",
          data: { invoice_code: "INV_1", subscription: { subscription_code: "SUB_1" } },
        },
        "invoice.payment_failed:INV_1",
      ],
      [
        "charges by reference",
        { event: "charge.success", data: { reference: "ref-1", subscription_code: "SUB_1" } },
        "charge.success:ref-1",
      ],
    ])("identifies %s", async (_label, body, eventId) => {
      prismaMock.webhookEvent.findUnique.mockResolvedValue({ processed: true });

      await run(body);

      expect(prismaMock.webhookEvent.findUnique).toHaveBeenCalledWith({ where: { eventId } });
    });
  });

  describe("charge.success", () => {
    it("marks a first payment successful and the request paid", async () => {
      prismaMock.transaction.findFirst.mockResolvedValue({
        id: "txn-1",
        verificationRequestId: "vr-1",
      });
      prismaMock.transaction.findUnique.mockResolvedValue({
        id: "txn-1",
        verificationRequestId: "vr-1",
        amountInCents: 500000,
        currency: "NGN",
        providerRef: "ref-1",
        verificationRequest: {
          user: { id: "user-1", email: "user@example.com", fullName: "Ada" },
          verificationPlan: { verificationType: { name: "Land" } },
        },
      });

      const res = await run({ event: "charge.success", data: { reference: "ref-1" } });

      expect(tx.transaction.updateMany).toHaveBeenCalledWith({
        where: { id: "txn-1", status: { not: "SUCCESS" } },
        data: { status: "SUCCESS", paidAt: expect.any(Date) },
      });
      expect(lifecycle.markRequestPaid).toHaveBeenCalledWith(tx, "vr-1");
      expect(appEvents.emit).toHaveBeenCalledWith(
        "PAYMENT_RECEIVED",
        expect.objectContaining({ userId: "user-1", booking_ref: "vr-1" }),
      );
      expect(prismaMock.webhookEvent.update).toHaveBeenCalledWith({
        where: { eventId: "charge.success:ref-1" },
        data: { processed: true },
      });
      expect(res.sendStatus).toHaveBeenCalledWith(200);
    });

    it("records a renewal against the subscription due closest to the charge", async () => {
      prismaMock.transaction.findFirst.mockResolvedValue(null);
      prismaMock.paystackSubscription.findMany.mockResolvedValue([
        {
          subscriptionCode: "SUB_far",
          verificationRequestId: "vr-far",
          status: "ACTIVE",
          nextPaymentDate: new Date("2026-11-01T00:00:00Z"),
        },
        {
          subscriptionCode: "SUB_near",
          verificationRequestId: "vr-near",
          status: "ACTIVE",
          nextPaymentDate: new Date("2026-11-20T00:00:00Z"),
        },
      ]);
      prismaMock.transaction.create.mockImplementation(async ({ data }) => ({
        id: "txn-2",
        ...data,
      }));

      await run({
        event: "charge.success",
        data: {
          reference: "ref-renewal",
          amount: 500000,
          paid_at: "2026-11-19T10:00:00Z",
          customer: { customer_code: "CUS_1" },
          plan: { plan_code: "PLN_1" },
        },
      });

      expect(prismaMock.transaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          verificationRequestId: "vr-near",
          status: "SUCCESS",
          providerRef: "ref-renewal",
        }),
      });
      expect(lifecycle.markRequestPaid).toHaveBeenCalledWith(tx, "vr-near");
    });
  });

  it("charge.failed marks the due payment failed", async () => {
    prismaMock.transaction.findFirst.mockResolvedValue({
      id: "txn-1",
      verificationRequestId: "vr-1",
    });

    await run({ event: "charge.failed", data: { reference: "ref-1" } });

    expect(tx.transaction.updateMany).toHaveBeenCalledWith({
      where: { id: "txn-1", status: "PENDING" },
      data: { status: "FAILED" },
    });
    expect(lifecycle.markRequestPaymentFailed).toHaveBeenCalledWith(tx, "vr-1");
  });

  describe("subscription.create", () => {
    const body = {
      event: "subscription.create",
      data: {
        subscription_code: "SUB_1",
        customer: { customer_code: "CUS_1" },
        plan: { plan_code: "PLN_1" },
      },
    };

    beforeEach(() => {
      prismaMock.user.findUnique.mockResolvedValue({ id: "user-1" });
      prismaMock.verificationPlan.findUnique.mockResolvedValue({ id: "plan-1" });
      prismaMock.paystackSubscription.findUnique.mockResolvedValue(null);
    });

    it("links the subscription to the paid request that doesn't have one yet", async () => {
      prismaMock.transaction.findFirst.mockResolvedValue({ verificationRequestId: "vr-2" });

      const res = await run(body);

      expect(prismaMock.transaction.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            verificationRequest: expect.objectContaining({ paystackSubscription: null }),
          }),
        }),
      );
      expect(prismaMock.paystackSubscription.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ verificationRequestId: "vr-2" }),
        }),
      );
      expect(res.sendStatus).toHaveBeenCalledWith(200);
    });

    it("fails so Paystack retries when the first payment hasn't been recorded yet", async () => {
      prismaMock.transaction.findFirst.mockResolvedValue(null);

      const res = await run(body);

      expect(res.sendStatus).toHaveBeenCalledWith(500);
      expect(prismaMock.paystackSubscription.upsert).not.toHaveBeenCalled();
      expect(prismaMock.webhookEvent.update).not.toHaveBeenCalled();
    });
  });

  describe("subscription status changes", () => {
    beforeEach(() => {
      prismaMock.paystackSubscription.findUnique.mockResolvedValue({
        verificationRequestId: "vr-1",
      });
    });

    it.each(["subscription.disable", "subscription.not_renew"])(
      "%s completes the request once every paid period is reported",
      async (event) => {
        await run({ event, data: { subscription_code: "SUB_1" } });

        expect(lifecycle.completeRequestIfFinished).toHaveBeenCalledWith(prismaMock, "vr-1");
        expect(lifecycle.markRequestPaymentFailed).not.toHaveBeenCalled();
      },
    );

    it("invoice.payment_failed marks the due payment failed", async () => {
      await run({
        event: "invoice.payment_failed",
        data: { invoice_code: "INV_1", subscription: { subscription_code: "SUB_1" } },
      });

      expect(prismaMock.paystackSubscription.updateMany).toHaveBeenCalledWith({
        where: { subscriptionCode: "SUB_1" },
        data: { status: "PAYMENT_FAILED" },
      });
      expect(lifecycle.markRequestPaymentFailed).toHaveBeenCalledWith(prismaMock, "vr-1");
      expect(lifecycle.completeRequestIfFinished).not.toHaveBeenCalled();
    });
  });
});
