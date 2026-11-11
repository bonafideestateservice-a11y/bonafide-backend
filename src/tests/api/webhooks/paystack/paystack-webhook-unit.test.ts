const tx = { transaction: { updateMany: jest.fn() } };
const prismaMock = {
  webhookEvent: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn() },
  transaction: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    upsert: jest.fn(),
  },
  monitoringSubscription: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
  providerPriceVersion: { findFirst: jest.fn() },
  paystackSubscription: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    upsert: jest.fn(),
    updateMany: jest.fn(),
  },
  user: { findUnique: jest.fn() },
  verificationPlan: { findFirst: jest.fn() },
  $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
};
const lifecycle = {
  markRequestPaid: jest.fn(),
  markRequestPaymentFailed: jest.fn(),
  completeRequestIfFinished: jest.fn(),
  announcePaymentFailed: jest.fn(),
  announceSubscriptionEnded: jest.fn(),
  recordFailedRenewal: jest.fn(),
};
const mockActivateMonitoring = jest.fn();
const mockCreateRenewalSnapshot = jest.fn(() => ({ version: 1 }));

jest.mock("../../../../utils/prisma", () => ({ prismaClient: prismaMock }));
jest.mock("../../../../api/services/database/verification-lifecycle", () => lifecycle);
jest.mock("../../../../api/services/database/pricing", () => ({
  activateMonitoringForPaidTransaction: mockActivateMonitoring,
  createMonitoringRenewalSnapshot: mockCreateRenewalSnapshot,
}));
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
    prismaMock.monitoringSubscription.findUnique.mockResolvedValue(null);
    prismaMock.monitoringSubscription.findMany.mockResolvedValue([]);
    prismaMock.providerPriceVersion.findFirst.mockResolvedValue(null);
    tx.transaction.updateMany.mockResolvedValue({ count: 1 });
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
        amountInCents: 500000,
        currency: "NGN",
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
      prismaMock.transaction.upsert.mockImplementation(async ({ create }) => ({
        id: "txn-2",
        ...create,
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

      expect(prismaMock.transaction.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { providerRef: "ref-renewal" },
          create: expect.objectContaining({
            verificationRequestId: "vr-near",
            status: "PENDING",
            providerRef: "ref-renewal",
          }),
        }),
      );
      expect(lifecycle.markRequestPaid).toHaveBeenCalledWith(tx, "vr-near");
    });

    it("creates a monitoring renewal transaction and activates its paid period", async () => {
      const monitoringSubscription = {
        id: "monitoring-sub-1",
        verificationRequestId: "vr-1",
        providerSubscriptionId: "SUB_monitoring",
        providerPriceVersionId: "price-v1",
        customerCode: "CUS_1",
        emailToken: "token-1",
        monitoringPlanId: "monitor-monthly",
        interval: "MONTHLY",
        intervalCount: 1,
        planVersion: 1,
        priceUsdCents: 6000,
        checksPerPeriod: 2,
        reportsPerPeriod: 1,
        consentAt: new Date("2026-10-01T00:00:00Z"),
        currentPeriodEnd: new Date("2026-11-01T00:00:00Z"),
      };
      prismaMock.monitoringSubscription.findUnique.mockResolvedValue(monitoringSubscription);
      prismaMock.transaction.upsert.mockImplementation(async ({ create }) => ({
        id: "renewal-1",
        ...create,
      }));

      await run({
        event: "charge.success",
        data: {
          reference: "ref-monitoring",
          amount: 9000000,
          currency: "NGN",
          paid_at: "2026-11-01T00:00:00Z",
          next_payment_date: "2026-12-01T00:00:00Z",
          subscription_code: "SUB_monitoring",
        },
      });

      expect(prismaMock.transaction.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { providerRef: "ref-monitoring" },
          create: expect.objectContaining({
            verificationRequestId: "vr-1",
            purpose: "RENEWAL",
            providerPriceVersionId: "price-v1",
            status: "PENDING",
          }),
        }),
      );
      expect(mockActivateMonitoring).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionId: "renewal-1",
          providerSubscriptionId: "SUB_monitoring",
          periodStart: monitoringSubscription.currentPeriodEnd,
          periodEnd: new Date("2026-12-01T00:00:00Z"),
        }),
      );
    });

    it("matches an anonymous monitoring charge to the closest period before status priority", async () => {
      const monitoringTerms = {
        provider: "PAYSTACK",
        providerPriceVersionId: "price-v1",
        customerCode: "CUS_1",
        monitoringPlanId: "monitor-monthly",
        interval: "MONTHLY",
        intervalCount: 1,
        planVersion: 1,
        priceUsdCents: 6000,
        checksPerPeriod: 2,
        reportsPerPeriod: 1,
        consentAt: new Date("2026-10-01T00:00:00Z"),
      };
      prismaMock.monitoringSubscription.findMany.mockResolvedValue([
        {
          ...monitoringTerms,
          verificationRequestId: "vr-active",
          providerSubscriptionId: "SUB_active",
          currentPeriodEnd: new Date("2026-11-28T00:00:00Z"),
          status: "ACTIVE",
        },
        {
          ...monitoringTerms,
          verificationRequestId: "vr-nearest",
          providerSubscriptionId: "SUB_nearest",
          currentPeriodEnd: new Date("2026-11-20T00:00:00Z"),
          status: "PAYMENT_FAILED",
        },
      ]);
      prismaMock.transaction.upsert.mockImplementation(async ({ create }) => ({
        id: "renewal-closest",
        ...create,
      }));

      await run({
        event: "charge.success",
        data: {
          reference: "ref-anonymous",
          amount: 9000000,
          currency: "NGN",
          paid_at: "2026-11-19T10:00:00Z",
          next_payment_date: "2026-12-20T00:00:00Z",
          customer: { customer_code: "CUS_1" },
          plan: { plan_code: "PLN_monthly_v1" },
        },
      });

      expect(prismaMock.transaction.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ verificationRequestId: "vr-nearest" }),
        }),
      );
      expect(mockActivateMonitoring).toHaveBeenCalledWith(
        expect.objectContaining({ providerSubscriptionId: "SUB_nearest" }),
      );
    });
  });

  it("charge.failed marks the due payment failed and announces it", async () => {
    prismaMock.transaction.findFirst.mockResolvedValue({
      id: "txn-1",
      verificationRequestId: "vr-1",
    });
    lifecycle.markRequestPaymentFailed.mockResolvedValue({ count: 1 });

    await run({ event: "charge.failed", data: { reference: "ref-1" } });

    expect(tx.transaction.updateMany).toHaveBeenCalledWith({
      where: { id: "txn-1", status: "PENDING" },
      data: { status: "FAILED" },
    });
    expect(lifecycle.markRequestPaymentFailed).toHaveBeenCalledWith(tx, "vr-1");
    expect(lifecycle.announcePaymentFailed).toHaveBeenCalledWith({ count: 1 }, "vr-1");
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
      prismaMock.verificationPlan.findFirst.mockResolvedValue({ id: "plan-1" });
      prismaMock.paystackSubscription.findUnique.mockResolvedValue(null);
    });

    it("links the subscription to the paid request that doesn't have one yet", async () => {
      prismaMock.transaction.findFirst.mockResolvedValue({ verificationRequestId: "vr-2" });

      const res = await run(body);

      expect(prismaMock.verificationPlan.findFirst).toHaveBeenCalledWith({
        where: { OR: [{ paystackPlanCode: "PLN_1" }, { paystackNgnPlanCode: "PLN_1" }] },
      });
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

    it("maps a ready recurring price to its paid monitoring transaction", async () => {
      const paidAt = new Date("2026-11-01T00:00:00Z");
      prismaMock.providerPriceVersion.findFirst.mockResolvedValue({
        id: "price-v1",
        monitoringPlanId: "monitor-monthly",
      });
      prismaMock.monitoringSubscription.findUnique.mockResolvedValue(null);
      prismaMock.transaction.findFirst.mockResolvedValue({
        id: "txn-monitoring",
        paidAt,
      });

      const res = await run({
        ...body,
        data: {
          ...body.data,
          next_payment_date: "2026-12-01T00:00:00Z",
          createdAt: "2026-11-01T00:00:00Z",
        },
      });

      expect(prismaMock.transaction.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            providerPriceVersionId: "price-v1",
            verificationRequest: expect.objectContaining({
              monitoringPlanId: "monitor-monthly",
              recurringConsent: true,
            }),
          }),
        }),
      );
      expect(mockActivateMonitoring).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionId: "txn-monitoring",
          providerSubscriptionId: "SUB_1",
          periodStart: paidAt,
          periodEnd: new Date("2026-12-01T00:00:00Z"),
        }),
      );
      expect(prismaMock.providerPriceVersion.findFirst).toHaveBeenCalledWith({
        where: {
          provider: "PAYSTACK",
          providerPriceId: "PLN_1",
          monitoringPlanId: { not: null },
          syncStatus: "READY",
        },
      });
      expect(res.sendStatus).toHaveBeenCalledWith(200);
      expect(prismaMock.paystackSubscription.upsert).not.toHaveBeenCalled();
    });
  });

  it.each(["invoice.create", "invoice.update"])(
    "%s keeps the subscription's next payment date current",
    async (event) => {
      await run({
        event,
        data: {
          invoice_code: `INV_${event}`,
          subscription: {
            subscription_code: "SUB_1",
            next_payment_date: "2026-10-20T13:48:00.000Z",
          },
        },
      });

      expect(prismaMock.paystackSubscription.updateMany).toHaveBeenCalledWith({
        where: { subscriptionCode: "SUB_1" },
        data: { nextPaymentDate: new Date("2026-10-20T13:48:00.000Z") },
      });
    },
  );

  describe("subscription status changes", () => {
    beforeEach(() => {
      prismaMock.paystackSubscription.findUnique.mockResolvedValue({
        verificationRequestId: "vr-1",
        status: "ACTIVE",
      });
    });

    it.each(["subscription.disable", "subscription.not_renew"])(
      "%s completes the request once every paid period is reported",
      async (event) => {
        await run({ event, data: { subscription_code: "SUB_1" } });

        expect(lifecycle.completeRequestIfFinished).toHaveBeenCalledWith(prismaMock, "vr-1");
        expect(lifecycle.markRequestPaymentFailed).not.toHaveBeenCalled();
        expect(lifecycle.announceSubscriptionEnded).toHaveBeenCalledWith("vr-1");
      },
    );

    it("subscription.disable after not_renew doesn't announce the end twice", async () => {
      prismaMock.paystackSubscription.findUnique.mockResolvedValue({
        verificationRequestId: "vr-1",
        status: "NON_RENEWING",
      });

      await run({ event: "subscription.disable", data: { subscription_code: "SUB_1" } });

      expect(lifecycle.completeRequestIfFinished).toHaveBeenCalled();
      expect(lifecycle.announceSubscriptionEnded).not.toHaveBeenCalled();
    });

    it("invoice.payment_failed records the failed renewal once per invoice", async () => {
      await run({
        event: "invoice.payment_failed",
        data: {
          invoice_code: "INV_1",
          amount: 5600000,
          subscription: { subscription_code: "SUB_1" },
        },
      });

      expect(prismaMock.paystackSubscription.updateMany).toHaveBeenCalledWith({
        where: { subscriptionCode: "SUB_1" },
        data: { status: "PAYMENT_FAILED" },
      });
      expect(lifecycle.recordFailedRenewal).toHaveBeenCalledWith({
        verificationRequestId: "vr-1",
        providerRef: "INV_1",
        amountInCents: 5600000,
        currency: "NGN",
      });
      expect(lifecycle.completeRequestIfFinished).not.toHaveBeenCalled();
    });

    it("updates monitoring cancellation status without downgrading an ended subscription", async () => {
      prismaMock.monitoringSubscription.findUnique.mockResolvedValue({
        verificationRequestId: "vr-monitoring",
        status: "NON_RENEWING",
      });

      await run({
        event: "subscription.disable",
        data: { subscription_code: "SUB_monitoring" },
      });

      expect(prismaMock.monitoringSubscription.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            providerSubscriptionId: "SUB_monitoring",
            status: { notIn: ["DISABLED", "EXPIRED"] },
          }),
          data: expect.objectContaining({ status: "DISABLED" }),
        }),
      );
      expect(lifecycle.completeRequestIfFinished).toHaveBeenCalledWith(prismaMock, "vr-monitoring");
      expect(lifecycle.announceSubscriptionEnded).not.toHaveBeenCalled();
    });

    it("records monitoring invoice failures with the immutable renewal terms", async () => {
      prismaMock.monitoringSubscription.findUnique.mockResolvedValue({
        verificationRequestId: "vr-monitoring",
        providerPriceVersionId: "price-v1",
        monitoringPlanId: "monitor-monthly",
        interval: "MONTHLY",
        intervalCount: 1,
        planVersion: 1,
        priceUsdCents: 6000,
        checksPerPeriod: 2,
        reportsPerPeriod: 1,
        consentAt: new Date("2026-10-01T00:00:00Z"),
        status: "ACTIVE",
      });

      await run({
        event: "invoice.payment_failed",
        data: {
          invoice_code: "INV_monitoring",
          amount: 9000000,
          currency: "NGN",
          subscription_code: "SUB_monitoring",
        },
      });

      expect(lifecycle.recordFailedRenewal).toHaveBeenCalledWith(
        expect.objectContaining({
          verificationRequestId: "vr-monitoring",
          providerRef: "INV_monitoring",
          amountInCents: 9000000,
          currency: "NGN",
          provider: "PAYSTACK",
          providerPriceVersionId: "price-v1",
          pricingSnapshot: { version: 1 },
        }),
      );
    });
  });
});
