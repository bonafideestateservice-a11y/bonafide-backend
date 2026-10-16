import request from "supertest";
import app from "../../../../app";
import { prismaClient } from "../../../../utils/prisma";
import { createFixtures } from "../../../helpers/fixtures";

const fx = createFixtures("paystack-callback");

afterAll(async () => {
  await fx.cleanup();
  await prismaClient.$disconnect();
});

const callback = (query = "") => request(app).get(`/api/v1/webhook/paystack/callback${query}`);

describe("GET /api/v1/webhook/paystack/callback", () => {
  it("shows the payment's status after Paystack redirects back", async () => {
    const client = await fx.createUser("CLIENT", "client");
    const paid = await fx.createPaidRequest(client.id);
    const reference = `ref_callback_${fx.tag}`;
    await prismaClient.transaction.update({
      where: { id: paid.paymentId },
      data: { providerRef: reference },
    });

    const response = await callback(`?reference=${reference}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      message: "Payment received. Webhook processing will update the verification request.",
      reference,
      status: "SUCCESS",
    });
  });

  it("returns 400 without a reference and 404 for an unknown one", async () => {
    expect((await callback()).status).toBe(400);
    expect((await callback("?reference=never-issued")).status).toBe(404);
  });
});
