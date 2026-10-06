const retrieveSubscription = jest.fn();

// Real Stripe signature verification; only the API call for subscriptions is stubbed.
jest.mock("../../../../libs/stripe", () => {
  const stripeModule = jest.requireActual("stripe");
  const Stripe = stripeModule.default ?? stripeModule;
  const client = new Stripe("sk_test_integration");
  return {
    getStripeClient: () => ({
      webhooks: client.webhooks,
      subscriptions: { retrieve: retrieveSubscription },
    }),
  };
});

import Stripe from "stripe";
import request from "supertest";
import { VerificationStatus } from "@prisma/client";
import app from "../../../../app";
import { prismaClient } from "../../../../utils/prisma";

const SECRET = "whsec_integration";
process.env.STRIPE_WEBHOOK_SECRET = SECRET;

const suffix = Date.now();
const signer = new Stripe("sk_test_integration");
let eventCount = 0;
let userId: string;
let agentId: string;
let agentUserId: string;
let serviceId: string;
let verificationTypeId: string;
let planId: string;
const requestIds: string[] = [];
const seconds = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

const send = (type: string, object: object, id = `evt_${suffix}_${++eventCount}`) => {
  const payload = JSON.stringify({ id, object: "event", type, data: { object } });
  const signature = signer.webhooks.generateTestHeaderString({ payload, secret: SECRET });
  return request(app)
    .post("/api/v1/webhook/stripe")
    .set("Content-Type", "application/json")
    .set("stripe-signature", signature)
    .send(payload);
};

const createRequest = async (status: VerificationStatus) => {
  const verificationRequest = await prismaClient.verificationRequest.create({
    data: {
      userId,
      verificationTypeId,
      verificationPlanId: planId,
      status,
      details: { propertyAddress: "Abuja" },
    },
  });
  requestIds.push(verificationRequest.id);
  return verificationRequest.id;
};

const requestStatus = async (id: string) =>
  (await prismaClient.verificationRequest.findUniqueOrThrow({ where: { id } })).status;

const subscriptionStatus = async (subscriptionId: string) =>
  (await prismaClient.stripeSubscription.findUniqueOrThrow({ where: { subscriptionId } })).status;

const subscriptionObject = (
  subscriptionId: string,
  status: string,
  metadata: Record<string, string> = {},
) => ({
  id: subscriptionId,
  object: "subscription",
  status,
  metadata,
  items: {
    data: [
      {
        price: { id: `price_${suffix}` },
        current_period_start: seconds("2026-10-01T00:00:00Z"),
        current_period_end: seconds("2026-11-01T00:00:00Z"),
      },
    ],
  },
});

const invoice = (invoiceId: string, subscriptionId: string) => ({
  id: invoiceId,
  object: "invoice",
  subscription: subscriptionId,
  billing_reason: "subscription_cycle",
  amount_paid: 500000,
  currency: "ngn",
  status_transitions: { paid_at: seconds("2026-11-01T08:00:00Z") },
  created: seconds("2026-11-01T08:00:00Z"),
});

/** A request with an active Stripe subscription whose first period is paid. */
const createSubscribedRequest = async (status: VerificationStatus) => {
  const verificationRequestId = await createRequest(status);
  const subscriptionId = `sub_${suffix}_${requestIds.length}`;
  await prismaClient.transaction.create({
    data: {
      verificationRequestId,
      amountInCents: 500000,
      method: "CARD",
      status: "SUCCESS",
      providerRef: `cs_${subscriptionId}`,
      stripeSubscriptionId: subscriptionId,
      paidAt: new Date("2026-10-01T08:00:00Z"),
    },
  });
  await prismaClient.stripeSubscription.create({
    data: { userId, verificationRequestId, verificationPlanId: planId, subscriptionId },
  });
  return { verificationRequestId, subscriptionId };
};

/** Mark every paid period of a request as reported. */
const reportAllPeriods = async (verificationRequestId: string) => {
  const paid = await prismaClient.transaction.findMany({
    where: { verificationRequestId, status: "SUCCESS", report: null },
  });
  for (const transaction of paid) {
    await prismaClient.verificationReport.create({
      data: {
        verificationRequestId,
        transactionId: transaction.id,
        submittedByAgentId: agentId,
        generatedAt: new Date(),
      },
    });
  }
};

beforeAll(async () => {
  userId = (
    await prismaClient.user.create({
      data: {
        fullName: "Stripe Webhook Client",
        email: `stripe-webhook-client-${suffix}@example.com`,
        role: "CLIENT",
      },
    })
  ).id;
  agentUserId = (
    await prismaClient.user.create({
      data: {
        fullName: "Stripe Webhook Agent",
        email: `stripe-webhook-agent-${suffix}@example.com`,
        role: "AGENT",
      },
    })
  ).id;
  agentId = (
    await prismaClient.verificationAgent.create({
      data: { userId: agentUserId, name: "Stripe Webhook Agent" },
    })
  ).id;
  serviceId = (
    await prismaClient.service.create({
      data: { name: `Stripe Webhook ${suffix}`, slug: `stripe-webhook-${suffix}` },
    })
  ).id;
  verificationTypeId = (
    await prismaClient.verificationType.create({
      data: { serviceId, name: "Land Verification", slug: `stripe-webhook-type-${suffix}` },
    })
  ).id;
  planId = (
    await prismaClient.verificationPlan.create({
      data: {
        verificationTypeId,
        frequency: "MONTHLY",
        name: "Monthly",
        priceInCents: 500000,
        stripePriceId: `price_${suffix}`,
      },
    })
  ).id;
});

afterAll(async () => {
  const where = { verificationRequestId: { in: requestIds } };
  await prismaClient.verificationReport.deleteMany({ where });
  await prismaClient.stripeSubscription.deleteMany({ where });
  await prismaClient.transaction.deleteMany({ where });
  await prismaClient.verificationRequest.deleteMany({ where: { id: { in: requestIds } } });
  await prismaClient.webhookEvent.deleteMany({ where: { eventId: { contains: String(suffix) } } });
  await prismaClient.verificationAgent.delete({ where: { id: agentId } });
  await prismaClient.verificationPlan.delete({ where: { id: planId } });
  await prismaClient.verificationType.delete({ where: { id: verificationTypeId } });
  await prismaClient.service.delete({ where: { id: serviceId } });
  await prismaClient.user.deleteMany({ where: { id: { in: [userId, agentUserId] } } });
  await prismaClient.$disconnect();
});

beforeEach(() => {
  retrieveSubscription.mockReset();
});

describe("POST /api/v1/webhook/stripe", () => {
  it("rejects a payload with an invalid signature", async () => {
    const response = await request(app)
      .post("/api/v1/webhook/stripe")
      .set("Content-Type", "application/json")
      .set("stripe-signature", "t=1,v1=invalid")
      .send(JSON.stringify({ id: "evt_bad", type: "invoice.paid", data: { object: {} } }));

    expect(response.status).toBe(400);
  });

  describe("checkout.session.completed", () => {
    it("marks the first payment successful and stores the subscription", async () => {
      const verificationRequestId = await createRequest(VerificationStatus.PENDING_PAYMENT);
      const transaction = await prismaClient.transaction.create({
        data: { verificationRequestId, amountInCents: 500000, method: "CARD", status: "PENDING" },
      });
      const metadata = {
        userId,
        verificationRequestId,
        transactionId: transaction.id,
        description: "Monthly land verification",
      };
      const subscriptionId = `sub_checkout_${suffix}`;
      retrieveSubscription.mockResolvedValue(subscriptionObject(subscriptionId, "active", metadata));
      const sessionId = `cs_checkout_${suffix}`;

      const response = await send("checkout.session.completed", {
        id: sessionId,
        object: "checkout.session",
        metadata,
        subscription: subscriptionId,
      });

      expect(response.status).toBe(200);
      expect(retrieveSubscription).toHaveBeenCalledWith(subscriptionId);
      const paid = await prismaClient.transaction.findUniqueOrThrow({
        where: { id: transaction.id },
      });
      expect(paid).toMatchObject({
        status: "SUCCESS",
        providerRef: sessionId,
        stripeSubscriptionId: subscriptionId,
      });
      expect(await requestStatus(verificationRequestId)).toBe(VerificationStatus.SUBMITTED);
      expect(await subscriptionStatus(subscriptionId)).toBe("ACTIVE");
    });

    it("ignores a duplicate delivery of the same event", async () => {
      const verificationRequestId = await createRequest(VerificationStatus.PENDING_PAYMENT);
      const transaction = await prismaClient.transaction.create({
        data: { verificationRequestId, amountInCents: 500000, method: "CARD", status: "PENDING" },
      });
      const session = {
        id: `cs_dup_${suffix}`,
        object: "checkout.session",
        metadata: {
          userId,
          verificationRequestId,
          transactionId: transaction.id,
          description: "One-time",
        },
        subscription: null,
      };
      const eventId = `evt_dup_${suffix}`;
      await send("checkout.session.completed", session, eventId);
      await prismaClient.verificationRequest.update({
        where: { id: verificationRequestId },
        data: { status: VerificationStatus.IN_PROGRESS },
      });

      const response = await send("checkout.session.completed", session, eventId);

      expect(response.status).toBe(200);
      expect(await requestStatus(verificationRequestId)).toBe(VerificationStatus.IN_PROGRESS);
    });
  });

  describe("renewals", () => {
    it("records invoice.paid without interrupting an inspection in progress", async () => {
      const { verificationRequestId, subscriptionId } = await createSubscribedRequest(
        VerificationStatus.IN_PROGRESS,
      );
      const invoiceId = `in_progress_${suffix}`;

      const response = await send("invoice.paid", invoice(invoiceId, subscriptionId));

      expect(response.status).toBe(200);
      const renewal = await prismaClient.transaction.findUniqueOrThrow({
        where: { providerRef: invoiceId },
      });
      expect(renewal).toMatchObject({
        verificationRequestId,
        status: "SUCCESS",
        amountInCents: 500000,
      });
      expect(await requestStatus(verificationRequestId)).toBe(VerificationStatus.IN_PROGRESS);
    });

    it("moves a request awaiting renewal to SUBMITTED on invoice.paid", async () => {
      const { verificationRequestId, subscriptionId } = await createSubscribedRequest(
        VerificationStatus.AWAITING_RENEWAL,
      );

      const response = await send("invoice.paid", invoice(`in_renew_${suffix}`, subscriptionId));

      expect(response.status).toBe(200);
      expect(await requestStatus(verificationRequestId)).toBe(VerificationStatus.SUBMITTED);
    });

    it("keeps the subscription active while Stripe retries a failed invoice", async () => {
      const { verificationRequestId, subscriptionId } = await createSubscribedRequest(
        VerificationStatus.AWAITING_RENEWAL,
      );

      const failed = await send(
        "invoice.payment_failed",
        invoice(`in_failed_${suffix}`, subscriptionId),
      );

      expect(failed.status).toBe(200);
      expect(await requestStatus(verificationRequestId)).toBe(VerificationStatus.PAYMENT_FAILED);
      expect(await subscriptionStatus(subscriptionId)).toBe("ACTIVE");

      const retried = await send("invoice.paid", invoice(`in_retried_${suffix}`, subscriptionId));

      expect(retried.status).toBe(200);
      expect(await requestStatus(verificationRequestId)).toBe(VerificationStatus.SUBMITTED);
    });

    it("leaves an inspection in progress alone when an invoice fails", async () => {
      const { verificationRequestId, subscriptionId } = await createSubscribedRequest(
        VerificationStatus.IN_PROGRESS,
      );

      await send("invoice.payment_failed", invoice(`in_failed_busy_${suffix}`, subscriptionId));

      expect(await requestStatus(verificationRequestId)).toBe(VerificationStatus.IN_PROGRESS);
    });
  });

  describe("subscription changes", () => {
    it("keeps a past_due subscription active", async () => {
      const { subscriptionId } = await createSubscribedRequest(VerificationStatus.AWAITING_RENEWAL);

      await send("customer.subscription.updated", subscriptionObject(subscriptionId, "past_due"));

      expect(await subscriptionStatus(subscriptionId)).toBe("ACTIVE");
    });

    it("marks the payment failed when Stripe gives up retrying (unpaid)", async () => {
      const { verificationRequestId, subscriptionId } = await createSubscribedRequest(
        VerificationStatus.AWAITING_RENEWAL,
      );

      await send("customer.subscription.updated", subscriptionObject(subscriptionId, "unpaid"));

      expect(await subscriptionStatus(subscriptionId)).toBe("INACTIVE");
      expect(await requestStatus(verificationRequestId)).toBe(VerificationStatus.PAYMENT_FAILED);
    });

    it("completes the request when the subscription is deleted and every period is reported", async () => {
      const { verificationRequestId, subscriptionId } = await createSubscribedRequest(
        VerificationStatus.AWAITING_RENEWAL,
      );
      await reportAllPeriods(verificationRequestId);

      const response = await send(
        "customer.subscription.deleted",
        subscriptionObject(subscriptionId, "canceled"),
      );

      expect(response.status).toBe(200);
      expect(await subscriptionStatus(subscriptionId)).toBe("INACTIVE");
      expect(await requestStatus(verificationRequestId)).toBe(VerificationStatus.COMPLETED);
    });

    it("leaves the request to finish its paid period when the subscription is deleted", async () => {
      const { verificationRequestId, subscriptionId } = await createSubscribedRequest(
        VerificationStatus.SUBMITTED,
      );

      await send("customer.subscription.deleted", subscriptionObject(subscriptionId, "canceled"));

      expect(await subscriptionStatus(subscriptionId)).toBe("INACTIVE");
      expect(await requestStatus(verificationRequestId)).toBe(VerificationStatus.SUBMITTED);
    });
  });
});
