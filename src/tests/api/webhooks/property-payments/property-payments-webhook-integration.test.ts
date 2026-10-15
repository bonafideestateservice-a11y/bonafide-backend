// Real Stripe signature verification; nothing else from Stripe is called for property payments.
jest.mock("../../../../libs/stripe", () => {
  const stripeModule = jest.requireActual("stripe");
  const Stripe = stripeModule.default ?? stripeModule;
  const client = new Stripe("sk_test_integration");
  return { getStripeClient: () => ({ webhooks: client.webhooks }) };
});

import crypto from "crypto";
import Stripe from "stripe";
import request from "supertest";
import app from "../../../../app";
import { prismaClient } from "../../../../utils/prisma";
import { createFixtures } from "../../../helpers/fixtures";

const PAYSTACK_SECRET = "sk_test_property_webhooks";
const STRIPE_SECRET = "whsec_property_webhooks";
process.env.PAYSTACK_SECRET_KEY = PAYSTACK_SECRET;
process.env.STRIPE_WEBHOOK_SECRET = STRIPE_SECRET;

const fx = createFixtures("property-webhooks");
const signer = new Stripe("sk_test_integration");
let clientId: string;
let events = 0;

beforeAll(async () => {
  clientId = (await fx.createUser("CLIENT", "client")).id;
});
afterAll(async () => {
  await fx.cleanup();
  await prismaClient.$disconnect();
});

const paystack = (event: string, paymentId: string, reference: string, amount = 8500000000) => {
  const body = JSON.stringify({
    event,
    data: {
      reference,
      amount,
      currency: "NGN",
      metadata: { kind: "property_payment", propertyPaymentId: paymentId },
    },
  });
  return request(app)
    .post("/api/v1/webhook/paystack")
    .set("Content-Type", "application/json")
    .set(
      "x-paystack-signature",
      crypto.createHmac("sha512", PAYSTACK_SECRET).update(body).digest("hex"),
    )
    .send(body);
};

const stripe = (type: string, paymentId: string, sessionId: string, extra = {}) => {
  const payload = JSON.stringify({
    id: `evt_${fx.tag}_${++events}`,
    object: "event",
    type,
    data: {
      object: {
        id: sessionId,
        object: "checkout.session",
        amount_total: 50000000,
        currency: "ngn",
        payment_status: "paid",
        metadata: { kind: "property_payment", propertyPaymentId: paymentId },
        ...extra,
      },
    },
  });
  return request(app)
    .post("/api/v1/webhook/stripe")
    .set("Content-Type", "application/json")
    .set(
      "stripe-signature",
      signer.webhooks.generateTestHeaderString({ payload, secret: STRIPE_SECRET }),
    )
    .send(payload);
};

/** A purchase in progress whose payment is PROCESSING with the given provider reference. */
const processing = async (providerRef: string, provider: "PAYSTACK" | "STRIPE" = "PAYSTACK") => {
  const purchase = await fx.createPurchase(clientId);
  return prismaClient.propertyPayment.update({
    where: { requestId: purchase.id },
    data: { status: "PROCESSING", provider, method: "CARD", providerRef, checkoutUrl: "https://x" },
  });
};
const reload = (id: string) =>
  prismaClient.propertyPayment.findUniqueOrThrow({
    where: { id },
    include: { request: { include: { updates: { orderBy: { createdAt: "asc" } } } } },
  });

describe("property payment webhooks", () => {
  it("Paystack charge.success marks the payment successful; the purchase stays in progress", async () => {
    const payment = await processing(`ps_ok_${fx.tag}`);

    expect((await paystack("charge.success", payment.id, `ps_ok_${fx.tag}`)).status).toBe(200);

    const after = await reload(payment.id);
    expect(after).toMatchObject({
      status: "SUCCESSFUL",
      provider: "PAYSTACK",
      paidAt: expect.any(Date),
    });
    expect(after.request.status).toBe("IN_PROGRESS");
    expect(after.request.updates.at(-1)?.note).toBe("Payment of NGN 85,000,000.00 received");
  });

  it("Paystack charge.failed marks it failed, and a later success still counts", async () => {
    const payment = await processing(`ps_fail_${fx.tag}`);

    await paystack("charge.failed", payment.id, `ps_fail_${fx.tag}`);
    expect((await reload(payment.id)).status).toBe("FAILED");

    await paystack("charge.success", payment.id, `ps_retry_${fx.tag}`);
    expect(await reload(payment.id)).toMatchObject({
      status: "SUCCESSFUL",
      providerRef: `ps_retry_${fx.tag}`,
    });
  });

  it("ignores a charge for the wrong amount", async () => {
    const payment = await processing(`ps_short_${fx.tag}`);
    await paystack("charge.success", payment.id, `ps_short_${fx.tag}`, 100);
    expect((await reload(payment.id)).status).toBe("PROCESSING");
  });

  it("a failure from an older attempt doesn't fail the newer open checkout", async () => {
    const payment = await processing(`ps_new_${fx.tag}`);
    await paystack("charge.failed", payment.id, `ps_old_${fx.tag}`);
    expect((await reload(payment.id)).status).toBe("PROCESSING");
  });

  it("Stripe checkout.session.completed marks it successful; expired marks it failed", async () => {
    const paid = await processing(`cs_ok_${fx.tag}`, "STRIPE");
    await prismaClient.propertyPayment.update({
      where: { id: paid.id },
      data: { amountInKobo: BigInt(50000000) },
    });
    expect((await stripe("checkout.session.completed", paid.id, `cs_ok_${fx.tag}`)).status).toBe(
      200,
    );
    expect(await reload(paid.id)).toMatchObject({ status: "SUCCESSFUL", provider: "STRIPE" });

    const expired = await processing(`cs_exp_${fx.tag}`, "STRIPE");
    await stripe("checkout.session.expired", expired.id, `cs_exp_${fx.tag}`, {
      payment_status: "unpaid",
    });
    expect((await reload(expired.id)).status).toBe("FAILED");
  });
});
