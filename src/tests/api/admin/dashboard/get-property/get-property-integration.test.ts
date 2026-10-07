import request from "supertest";
import app from "../../../../../app";
import { prismaClient } from "../../../../../utils/prisma";
import { createFixtures } from "../../../../helpers/fixtures";

const fx = createFixtures("admin-get-property");
let adminToken: string;
let clientToken: string;

beforeAll(async () => {
  adminToken = (await fx.createUser("ADMIN", "admin")).token;
  clientToken = (await fx.createUser("CLIENT", "client")).token;
});
afterAll(async () => {
  await fx.cleanup();
  await prismaClient.$disconnect();
});

const get = (id: string, token = adminToken) =>
  request(app).get(`/api/v1/admin/properties/${id}`).set("Authorization", `Bearer ${token}`);

describe("GET /api/v1/admin/properties/:id", () => {
  it("returns the property with views, inquiries and favorites", async () => {
    const client = await fx.createUser("CLIENT", "fan");
    const property = await fx.createProperty({ viewCount: 9, isPublished: false });
    await prismaClient.propertyInquiry.create({
      data: { propertyId: property.id, userId: client.id, message: "Hi" },
    });
    await prismaClient.propertyFavorite.create({
      data: { propertyId: property.id, userId: client.id },
    });

    const response = await get(property.id);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: property.id,
      number: property.number,
      isPublished: false,
      status: "PENDING",
      verifiedAt: null,
      stats: { views: 9, inquiries: 1, favorites: 1 },
    });
  });

  it("returns 404 for deleted and unknown properties", async () => {
    const deleted = await fx.createProperty({ deletedAt: new Date() });
    expect((await get(deleted.id)).status).toBe(404);
    expect((await get("missing")).status).toBe(404);
  });

  it("returns 401 without a token and 403 for non-admins", async () => {
    const property = await fx.createProperty();
    expect((await request(app).get(`/api/v1/admin/properties/${property.id}`)).status).toBe(401);
    expect((await get(property.id, clientToken)).status).toBe(403);
  });
});
