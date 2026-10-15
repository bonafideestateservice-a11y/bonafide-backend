import request from "supertest";
import app from "../../../../../app";
import { prismaClient } from "../../../../../utils/prisma";
import { createFixtures } from "../../../../helpers/fixtures";

const fx = createFixtures("purchase-notice");

afterAll(async () => {
  await fx.cleanup();
  await prismaClient.$disconnect();
});

describe("POST /api/v1/admin/property-requests/:id/notices", () => {
  it("adds a NOTICE card without changing the status", async () => {
    const admin = await fx.createUser("ADMIN", "admin");
    const client = await fx.createUser("CLIENT", "client");
    const purchase = await fx.createPurchase(client.id, "IN_PROGRESS");

    const response = await request(app)
      .post(`/api/v1/admin/property-requests/${purchase.id}/notices`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({
        title: "Purchase notice",
        message: "Bonafide will communicate any requested documents for this purchase.",
      });

    expect(response.status).toBe(201);
    expect(response.body.status).toBe("IN_PROGRESS");
    expect(response.body.updates.at(-1)).toMatchObject({
      status: "IN_PROGRESS",
      kind: "NOTICE",
      title: "Purchase notice",
      message: "Bonafide will communicate any requested documents for this purchase.",
    });
  });

  it("returns 400 without a message and 404 for an unknown request", async () => {
    const admin = await fx.createUser("ADMIN", "admin2");
    const send = (id: string, body: object) =>
      request(app)
        .post(`/api/v1/admin/property-requests/${id}/notices`)
        .set("Authorization", `Bearer ${admin.token}`)
        .send(body);
    const client = await fx.createUser("CLIENT", "client2");
    const purchase = await fx.createPurchase(client.id, "SUBMITTED");
    expect((await send(purchase.id, { title: "Notice" })).status).toBe(400);
    expect((await send("missing", { title: "Notice", message: "Hi" })).status).toBe(404);
  });
});
