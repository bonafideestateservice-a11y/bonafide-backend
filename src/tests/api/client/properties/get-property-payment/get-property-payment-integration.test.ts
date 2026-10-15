import request from "supertest";
import app from "../../../../../app";
import { prismaClient } from "../../../../../utils/prisma";
import { createFixtures } from "../../../../helpers/fixtures";

const fx = createFixtures("property-payment-get");

afterAll(async () => {
  await fx.cleanup();
  await prismaClient.$disconnect();
});

describe("GET /api/v1/client/property-requests/:id/payment", () => {
  it("returns the payment once the purchase is in progress, and 404 before", async () => {
    const client = await fx.createUser("CLIENT", "client");
    const ready = await fx.createPurchase(client.id, "IN_PROGRESS");
    const early = await fx.createPurchase(client.id, "CONSULTATION");
    const get = (id: string) =>
      request(app)
        .get(`/api/v1/client/property-requests/${id}/payment`)
        .set("Authorization", `Bearer ${client.token}`);

    const response = await get(ready.id);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: "READY", amount: 85000000, currency: "NGN" });
    expect((await get(early.id)).status).toBe(404);
  });
});
