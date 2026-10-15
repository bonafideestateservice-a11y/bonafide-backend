const createStripeCheckout = jest.fn();
jest.mock("../../../../../libs/stripe/stripe", () => ({
  ...jest.requireActual("../../../../../libs/stripe/stripe"),
  createStripeCheckout,
}));

import request from "supertest";
import app from "../../../../../app";
import { prismaClient } from "../../../../../utils/prisma";
import { createFixtures } from "../../../../helpers/fixtures";

const fx = createFixtures("pay-property-stripe");
let client: Awaited<ReturnType<typeof fx.createUser>>;

beforeAll(async () => {
  client = await fx.createUser("CLIENT", "client");
  createStripeCheckout.mockImplementation(async () => ({
    id: `cs_${Date.now()}`,
    url: "https://checkout.stripe.com/c/pay/test",
  }));
});
afterAll(async () => {
  await fx.cleanup();
  await prismaClient.$disconnect();
});

const pay = (id: string) =>
  request(app)
    .post(`/api/v1/client/property-requests/${id}/payment/stripe`)
    .set("Authorization", `Bearer ${client.token}`);

describe("POST /api/v1/client/property-requests/:id/payment/stripe", () => {
  it("starts a Stripe card checkout for a price within Stripe's limit", async () => {
    const purchase = await fx.createPurchase(client.id);
    // ₦500,000 = 50,000,000 kobo, under Stripe's 99,999,999 cap.
    await prismaClient.propertyPayment.update({
      where: { requestId: purchase.id },
      data: { amountInKobo: BigInt(50000000) },
    });

    const response = await pay(purchase.id);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: "PROCESSING",
      provider: "STRIPE",
      method: "CARD",
      amount: 500000,
      checkoutUrl: "https://checkout.stripe.com/c/pay/test",
    });
  });

  it("returns 400 for an ₦85m price, above Stripe's limit", async () => {
    const purchase = await fx.createPurchase(client.id);
    const response = await pay(purchase.id);
    expect(response.status).toBe(400);
    expect(response.body.message).toContain("Pay with Paystack instead");
  });
});
