import request from "supertest";
import app from "../../../../../app";
import { prismaClient } from "../../../../../utils/prisma";
import { createFixtures } from "../../../../helpers/fixtures";

const fx = createFixtures("client-get-property");

afterAll(async () => {
  await fx.cleanup();
  await prismaClient.$disconnect();
});

const get = (id: string) => request(app).get(`/api/v1/client/properties/${id}`);

describe("GET /api/v1/client/properties/:id", () => {
  it("returns a published property and counts every call as a view", async () => {
    const property = await fx.createProperty({ viewCount: 5 });

    const first = await get(property.id);
    await get(property.id);

    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({
      id: property.id,
      number: property.number,
      viewCount: 6,
      isFavorite: false,
    });
    const row = await prismaClient.property.findUnique({ where: { id: property.id } });
    expect(row?.viewCount).toBe(7);
  });

  it("shows isFavorite for the signed-in user", async () => {
    const client = await fx.createUser("CLIENT", "fan");
    const property = await fx.createProperty();
    await prismaClient.propertyFavorite.create({
      data: { userId: client.id, propertyId: property.id },
    });

    const response = await get(property.id).set("Authorization", `Bearer ${client.token}`);

    expect(response.body.isFavorite).toBe(true);
  });

  it("returns 404 for unpublished, deleted and unknown properties", async () => {
    const draft = await fx.createProperty({ isPublished: false });
    const deleted = await fx.createProperty({ deletedAt: new Date() });
    for (const id of [draft.id, deleted.id, "missing"]) {
      expect((await get(id)).status).toBe(404);
    }
    const row = await prismaClient.property.findUnique({ where: { id: draft.id } });
    expect(row?.viewCount).toBe(0);
  });
});
