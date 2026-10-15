const createPaystackCheckout = jest.fn();
jest.mock("../../../../../libs/paystack/paystack", () => ({
  ...jest.requireActual("../../../../../libs/paystack/paystack"),
  createPaystackCheckout,
}));

import request from "supertest";
import app from "../../../../../app";
import { prismaClient } from "../../../../../utils/prisma";
import { createFixtures } from "../../../../helpers/fixtures";

const fx = createFixtures("pay-property-paystack");
let client: Awaited<ReturnType<typeof fx.createUser>>;
let checkouts = 0;

beforeAll(async () => {
  client = await fx.createUser("CLIENT", "client");
});
beforeEach(() => {
  createPaystackCheckout.mockImplementation(async () => {
    checkouts += 1;
    return {
      reference: `ref_${fx.tag}_${checkouts}`,
      authorization_url: `https://checkout.paystack.com/${checkouts}`,
    };
  });
});
afterAll(async () => {
  await prismaClient.idempotencyKey.deleteMany({ where: { userId: client.id } });
  await fx.cleanup();
  await prismaClient.$disconnect();
});

const pay = (id: string, method: string, key?: string) => {
  const call = request(app)
    .post(`/api/v1/client/property-requests/${id}/payment/paystack`)
    .set("Authorization", `Bearer ${client.token}`)
    .send({ method });
  return key ? call.set("Idempotency-Key", key) : call;
};

describe("POST /api/v1/client/property-requests/:id/payment/paystack", () => {
  it("starts a checkout for the property's full price in kobo", async () => {
    const purchase = await fx.createPurchase(client.id);

    const response = await pay(purchase.id, "CARD");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: "PROCESSING",
      provider: "PAYSTACK",
      method: "CARD",
      amount: 85000000,
      checkoutUrl: expect.stringContaining("https://checkout.paystack.com/"),
    });
    expect(createPaystackCheckout).toHaveBeenLastCalledWith(
      expect.objectContaining({ amount: 8500000000, currency: "NGN", channels: ["card"] }),
    );
  });

  it("reuses the open checkout, and starts a new one for bank transfer", async () => {
    const purchase = await fx.createPurchase(client.id);
    const first = await pay(purchase.id, "CARD");
    const again = await pay(purchase.id, "CARD");
    const transfer = await pay(purchase.id, "BANK_TRANSFER");

    expect(again.body.checkoutUrl).toBe(first.body.checkoutUrl);
    expect(transfer.body).toMatchObject({ method: "BANK_TRANSFER" });
    expect(transfer.body.checkoutUrl).not.toBe(first.body.checkoutUrl);
  });

  it("replays a repeated Idempotency-Key without a second checkout", async () => {
    const purchase = await fx.createPurchase(client.id);
    const key = `pay-${fx.tag}`;
    const before = createPaystackCheckout.mock.calls.length;

    const first = await pay(purchase.id, "BANK_TRANSFER", key);
    const replay = await pay(purchase.id, "CARD", key);

    expect(replay.headers["idempotent-replayed"]).toBe("true");
    expect(replay.body).toEqual(first.body);
    expect(createPaystackCheckout.mock.calls.length - before).toBe(1);
  });

  it("refuses payments that aren't open yet, already paid or for another client", async () => {
    const early = await fx.createPurchase(client.id, "CONSULTATION");
    expect((await pay(early.id, "CARD")).status).toBe(409);

    const paid = await fx.createPurchase(client.id);
    await prismaClient.propertyPayment.update({
      where: { requestId: paid.id },
      data: { status: "SUCCESSFUL" },
    });
    const response = await pay(paid.id, "CARD");
    expect(response.status).toBe(409);
    expect(response.body.message).toBe("This purchase has already been paid for.");

    const other = await fx.createUser("CLIENT", "other");
    const theirs = await fx.createPurchase(other.id);
    expect((await pay(theirs.id, "CARD")).status).toBe(404);
  });

  it("returns 400 for an unknown method", async () => {
    const purchase = await fx.createPurchase(client.id);
    expect((await pay(purchase.id, "CASH")).status).toBe(400);
  });
});
