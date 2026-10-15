import request from "supertest";
import app from "../../../../../app";
import { prismaClient } from "../../../../../utils/prisma";
import { createFixtures } from "../../../../helpers/fixtures";

const fx = createFixtures("admin-property-request");

afterAll(async () => {
  await fx.cleanup();
  await prismaClient.$disconnect();
});

describe("GET /api/v1/admin/property-requests/:id", () => {
  it("returns the request with its client, and 404 for unknown ids", async () => {
    const admin = await fx.createUser("ADMIN", "admin");
    const client = await fx.createUser("CLIENT", "client");
    const purchase = await fx.createPurchase(client.id, "SUBMITTED");
    const get = (id: string) =>
      request(app)
        .get(`/api/v1/admin/property-requests/${id}`)
        .set("Authorization", `Bearer ${admin.token}`);

    const response = await get(purchase.id);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: purchase.id,
      status: "SUBMITTED",
      client: { id: client.id, email: client.email },
    });
    expect((await get("missing")).status).toBe(404);
  });
});
