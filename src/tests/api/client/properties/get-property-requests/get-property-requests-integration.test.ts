import request from "supertest";
import app from "../../../../../app";
import { prismaClient } from "../../../../../utils/prisma";
import { createFixtures } from "../../../../helpers/fixtures";

const fx = createFixtures("property-requests-list");

afterAll(async () => {
  await fx.cleanup();
  await prismaClient.$disconnect();
});

describe("GET /api/v1/client/property-requests", () => {
  it("lists the client's own requests, newest first, filtered by type", async () => {
    const client = await fx.createUser("CLIENT", "client");
    const other = await fx.createUser("CLIENT", "other");
    const purchase = await fx.createPurchase(client.id, "SUBMITTED");
    const consultation = await fx.createPurchase(client.id, "SUBMITTED", "CONSULTATION");
    await fx.createPurchase(other.id, "SUBMITTED");
    const get = (query = "") =>
      request(app)
        .get(`/api/v1/client/property-requests${query}`)
        .set("Authorization", `Bearer ${client.token}`);

    const all = await get();
    expect(all.status).toBe(200);
    expect(all.body.data.map((r: { id: string }) => r.id)).toEqual([consultation.id, purchase.id]);
    expect(all.body.meta.totalItems).toBe(2);

    const purchases = await get("?type=PURCHASE");
    expect(purchases.body.data.map((r: { id: string }) => r.id)).toEqual([purchase.id]);
  });

  it("returns 401 without a token", async () => {
    expect((await request(app).get("/api/v1/client/property-requests")).status).toBe(401);
  });
});
