import request from "supertest";
import app from "../../../../../app";
import { prismaClient } from "../../../../../utils/prisma";
import { createFixtures } from "../../../../helpers/fixtures";

const fx = createFixtures("admin-property-requests");
let adminToken: string;
let clientToken: string;
let clientId: string;

beforeAll(async () => {
  adminToken = (await fx.createUser("ADMIN", "admin")).token;
  const client = await fx.createUser("CLIENT", "client");
  clientToken = client.token;
  clientId = client.id;
});
afterAll(async () => {
  await fx.cleanup();
  await prismaClient.$disconnect();
});

const get = (query: string, token = adminToken) =>
  request(app)
    .get(`/api/v1/admin/property-requests${query}`)
    .set("Authorization", `Bearer ${token}`);

describe("GET /api/v1/admin/property-requests", () => {
  it("lists requests with the client, filtered and searchable", async () => {
    const purchase = await fx.createPurchase(clientId, "IN_PROGRESS");
    await fx.createPurchase(clientId, "SUBMITTED", "CONSULTATION");

    const response = await get(`?search=${fx.tag}&type=PURCHASE`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({
      id: purchase.id,
      client: { id: clientId, name: `client ${fx.tag}` },
      payment: { status: "READY" },
    });
    const byReference = await get(`?search=${purchase.reference}`);
    expect(byReference.body.data.map((r: { id: string }) => r.id)).toEqual([purchase.id]);
  });

  it("is admin only", async () => {
    expect((await get("", clientToken)).status).toBe(403);
    expect((await request(app).get("/api/v1/admin/property-requests")).status).toBe(401);
  });
});
