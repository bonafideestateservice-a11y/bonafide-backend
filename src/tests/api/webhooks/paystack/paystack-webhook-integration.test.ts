import crypto from "crypto";
import request from "supertest";
import { VerificationStatus } from "@prisma/client";
import app from "../../../../app";
import { prismaClient } from "../../../../utils/prisma";

const SECRET = "paystack-integration-secret";
process.env.PAYSTACK_SECRET_KEY = SECRET;

const suffix = Date.now();
const customerCode = `CUS_${suffix}`;
const planCode = `PLN_${suffix}`;
let userId: string;
let agentUserId: string;
let agentId: string;
let serviceId: string;
let verificationTypeId: string;
let planId: string;
const requestIds: string[] = [];

const send = (body: object, secret = SECRET) => {
  const payload = JSON.stringify(body);
  const signature = crypto.createHmac("sha512", secret).update(payload).digest("hex");
  return request(app)
    .post("/api/v1/webhook/paystack")
    .set("Content-Type", "application/json")
    .set("x-paystack-signature", signature)
    .send(payload);
};

const createRequest = async (status: VerificationStatus) => {
  const verificationRequest = await prismaClient.verificationRequest.create({
    data: {
      userId,
      verificationTypeId,
      verificationPlanId: planId,
      status,
      details: { propertyAddress: "Lagos" },
    },
  });
  requestIds.push(verificationRequest.id);
  return verificationRequest.id;
};

const createTransaction = (
  verificationRequestId: string,
  providerRef: string,
  status: "PENDING" | "SUCCESS",
) =>
  prismaClient.transaction.create({
    data: {
      verificationRequestId,
      amountInCents: 500000,
      method: "CARD",
      status,
      providerRef,
      paidAt: status === "SUCCESS" ? new Date() : null,
    },
  });

const reportPeriod = (verificationRequestId: string, transactionId: string) =>
  prismaClient.verificationReport.create({
    data: { verificationRequestId, transactionId, submittedByAgentId: agentId, generatedAt: new Date() },
  });

const requestStatus = async (id: string) =>
  (await prismaClient.verificationRequest.findUniqueOrThrow({ where: { id } })).status;

const chargeSuccess = (reference: string, extra: Record<string, unknown> = {}) => ({
  event: "charge.success",
  data: {
    reference,
    amount: 500000,
    currency: "NGN",
    customer: { customer_code: customerCode },
    plan: { plan_code: planCode },
    ...extra,
  },
});

// Invoice events nest the subscription and carry their own invoice code.
const invoiceFailed = (subscriptionCode: string, invoiceCode: string) => ({
  event: "invoice.payment_failed",
  data: {
    id: invoiceCode,
    invoice_code: invoiceCode,
    subscription: { subscription_code: subscriptionCode },
    customer: { customer_code: customerCode },
  },
});

const subscriptionEvent = (event: string, subscriptionCode: string, extra = {}) => ({
  event,
  data: {
    subscription_code: subscriptionCode,
    customer: { customer_code: customerCode },
    plan: { plan_code: planCode },
    next_payment_date: "2026-11-01T00:00:00.000Z",
    ...extra,
  },
});

beforeAll(async () => {
  const user = await prismaClient.user.create({
    data: {
      fullName: "Paystack Webhook Client",
      email: `paystack-webhook-client-${suffix}@example.com`,
      role: "CLIENT",
      paystackCustomerCode: customerCode,
    },
  });
  userId = user.id;

  const agentUser = await prismaClient.user.create({
    data: {
      fullName: "Paystack Webhook Agent",
      email: `paystack-webhook-agent-${suffix}@example.com`,
      role: "AGENT",
    },
  });
  agentUserId = agentUser.id;
  agentId = (
    await prismaClient.verificationAgent.create({
      data: { userId: agentUserId, name: "Paystack Webhook Agent" },
    })
  ).id;

  serviceId = (
    await prismaClient.service.create({
      data: { name: `Paystack Webhook ${suffix}`, slug: `paystack-webhook-${suffix}` },
    })
  ).id;
  verificationTypeId = (
    await prismaClient.verificationType.create({
      data: { serviceId, name: "Land Verification", slug: `paystack-webhook-type-${suffix}` },
    })
  ).id;
  planId = (
    await prismaClient.verificationPlan.create({
      data: {
        verificationTypeId,
        frequency: "MONTHLY",
        name: "Monthly",
        priceInCents: 500000,
        paystackPlanCode: planCode,
      },
    })
  ).id;
});

afterAll(async () => {
  const where = { verificationRequestId: { in: requestIds } };
  await prismaClient.verificationReport.deleteMany({ where });
  await prismaClient.agentAssignment.deleteMany({ where });
  await prismaClient.paystackSubscription.deleteMany({ where });
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

describe("POST /api/v1/webhook/paystack", () => {
  it("rejects a payload with an invalid signature", async () => {
    const response = await send(chargeSuccess(`ref-bad-${suffix}`), "wrong-secret");

    expect(response.status).toBe(400);
  });

  describe("first payment and subscription", () => {
    let requestId: string;
    const reference = `ref-initial-${suffix}`;
    const subscriptionCode = `SUB_first_${suffix}`;

    beforeAll(async () => {
      requestId = await createRequest(VerificationStatus.PENDING_PAYMENT);
      await createTransaction(requestId, reference, "PENDING");
    });

    it("asks Paystack to retry subscription.create when it arrives before the payment", async () => {
      const response = await send(subscriptionEvent("subscription.create", subscriptionCode));

      expect(response.status).toBe(500);
      await expect(
        prismaClient.paystackSubscription.findUnique({ where: { subscriptionCode } }),
      ).resolves.toBeNull();
    });

    it("marks the payment successful and the request ready for an agent", async () => {
      const response = await send(chargeSuccess(reference));

      expect(response.status).toBe(200);
      const transaction = await prismaClient.transaction.findUniqueOrThrow({
        where: { providerRef: reference },
      });
      expect(transaction.status).toBe("SUCCESS");
      expect(transaction.paidAt).not.toBeNull();
      expect(await requestStatus(requestId)).toBe(VerificationStatus.SUBMITTED);
    });

    it("ignores a duplicate delivery of the same event", async () => {
      await prismaClient.verificationRequest.update({
        where: { id: requestId },
        data: { status: VerificationStatus.IN_PROGRESS },
      });

      const response = await send(chargeSuccess(reference));

      expect(response.status).toBe(200);
      expect(await requestStatus(requestId)).toBe(VerificationStatus.IN_PROGRESS);
    });

    it("stores the subscription when Paystack retries subscription.create", async () => {
      const response = await send(subscriptionEvent("subscription.create", subscriptionCode));

      expect(response.status).toBe(200);
      const subscription = await prismaClient.paystackSubscription.findUniqueOrThrow({
        where: { subscriptionCode },
      });
      expect(subscription.verificationRequestId).toBe(requestId);
      expect(subscription.status).toBe("ACTIVE");
    });

    it("links a second subscription on the same plan to the second request", async () => {
      const secondRequestId = await createRequest(VerificationStatus.PENDING_PAYMENT);
      const secondReference = `ref-second-${suffix}`;
      await createTransaction(secondRequestId, secondReference, "PENDING");
      await send(chargeSuccess(secondReference));

      const secondCode = `SUB_second_${suffix}`;
      const response = await send(subscriptionEvent("subscription.create", secondCode));

      expect(response.status).toBe(200);
      const subscription = await prismaClient.paystackSubscription.findUniqueOrThrow({
        where: { subscriptionCode: secondCode },
      });
      expect(subscription.verificationRequestId).toBe(secondRequestId);
    });
  });

  describe("renewals", () => {
    let requestId: string;
    const subscriptionCode = `SUB_renewal_${suffix}`;

    beforeAll(async () => {
      requestId = await createRequest(VerificationStatus.IN_PROGRESS);
      await createTransaction(requestId, `ref-renew-0-${suffix}`, "SUCCESS");
      await prismaClient.paystackSubscription.create({
        data: {
          userId,
          verificationRequestId: requestId,
          verificationPlanId: planId,
          customerCode,
          subscriptionCode,
          nextPaymentDate: new Date("2026-11-01T00:00:00.000Z"),
        },
      });
    });

    it("records a renewal without interrupting an inspection in progress", async () => {
      const reference = `ref-renew-1-${suffix}`;

      const response = await send(chargeSuccess(reference, { subscription_code: subscriptionCode }));

      expect(response.status).toBe(200);
      const renewal = await prismaClient.transaction.findUniqueOrThrow({
        where: { providerRef: reference },
      });
      expect(renewal.verificationRequestId).toBe(requestId);
      expect(renewal.status).toBe("SUCCESS");
      expect(await requestStatus(requestId)).toBe(VerificationStatus.IN_PROGRESS);
    });

    it("leaves an inspection in progress alone when a renewal invoice fails", async () => {
      const response = await send(invoiceFailed(subscriptionCode, `INV_1_${suffix}`));

      expect(response.status).toBe(200);
      expect(await requestStatus(requestId)).toBe(VerificationStatus.IN_PROGRESS);
    });

    it("marks a request awaiting renewal as failed when the renewal fails", async () => {
      await prismaClient.verificationRequest.update({
        where: { id: requestId },
        data: { status: VerificationStatus.AWAITING_RENEWAL },
      });

      const response = await send(invoiceFailed(subscriptionCode, `INV_2_${suffix}`));

      expect(response.status).toBe(200);
      expect(await requestStatus(requestId)).toBe(VerificationStatus.PAYMENT_FAILED);
    });

    it("moves a request back to SUBMITTED when a renewal succeeds after a failure", async () => {
      const response = await send(
        chargeSuccess(`ref-renew-2-${suffix}`, { subscription_code: subscriptionCode }),
      );

      expect(response.status).toBe(200);
      expect(await requestStatus(requestId)).toBe(VerificationStatus.SUBMITTED);
    });

    it("matches a renewal without a subscription code to the subscription due closest", async () => {
      const otherRequestId = await createRequest(VerificationStatus.AWAITING_RENEWAL);
      await prismaClient.paystackSubscription.create({
        data: {
          userId,
          verificationRequestId: otherRequestId,
          verificationPlanId: planId,
          customerCode,
          subscriptionCode: `SUB_other_${suffix}`,
          nextPaymentDate: new Date("2026-11-20T00:00:00.000Z"),
        },
      });
      const reference = `ref-renew-closest-${suffix}`;

      const response = await send(chargeSuccess(reference, { paid_at: "2026-11-19T09:00:00.000Z" }));

      expect(response.status).toBe(200);
      const renewal = await prismaClient.transaction.findUniqueOrThrow({
        where: { providerRef: reference },
      });
      expect(renewal.verificationRequestId).toBe(otherRequestId);
      expect(await requestStatus(otherRequestId)).toBe(VerificationStatus.SUBMITTED);
    });

    it("processes subscription.disable after subscription.create for the same subscription", async () => {
      // Every paid period is reported, so nothing is left to inspect.
      const paid = await prismaClient.transaction.findMany({
        where: { verificationRequestId: requestId, status: "SUCCESS" },
      });
      for (const transaction of paid) await reportPeriod(requestId, transaction.id);
      await prismaClient.verificationRequest.update({
        where: { id: requestId },
        data: { status: VerificationStatus.AWAITING_RENEWAL },
      });

      const created = await send(subscriptionEvent("subscription.create", subscriptionCode));
      const disabled = await send(subscriptionEvent("subscription.disable", subscriptionCode));

      expect(created.status).toBe(200);
      expect(disabled.status).toBe(200);
      const subscription = await prismaClient.paystackSubscription.findUniqueOrThrow({
        where: { subscriptionCode },
      });
      expect(subscription.status).toBe("DISABLED");
      expect(subscription.disabledAt).not.toBeNull();
      expect(await requestStatus(requestId)).toBe(VerificationStatus.COMPLETED);
    });
  });
});
