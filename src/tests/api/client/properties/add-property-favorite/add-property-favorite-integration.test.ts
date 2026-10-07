import request from "supertest";
import app from "../../../../../app";
import { prismaClient } from "../../../../../utils/prisma";
import { createFixtures } from "../../../../helpers/fixtures";

const fx = createFixtures("client-add-favorite");

afterAll(async () => {
  await fx.cleanup();
  await prismaClient.$disconnect();
});

const favorites = (propertyId: string) =>
  prismaClient.propertyFavorite.count({ where: { propertyId } });

describe("POST /api/v1/client/properties/:id/favorite", () => {
  it("saves the property once, however many times it's called", async () => {
    const client = await fx.createUser("CLIENT", "client");
    const property = await fx.createProperty();
    const save = () =>
      request(app)
        .post(`/api/v1/client/properties/${property.id}/favorite`)
        .set("Authorization", `Bearer ${client.token}`);

    const first = await save();
    const second = await save();

    expect(first.status).toBe(200);
    expect(second.body).toEqual({ propertyId: property.id, isFavorite: true });
    expect(await favorites(property.id)).toBe(1);
  });

  it("returns 404 for unpublished properties and 401 without a token", async () => {
    const client = await fx.createUser("CLIENT", "other");
    const draft = await fx.createProperty({ isPublished: false });
    const url = `/api/v1/client/properties/${draft.id}/favorite`;
    expect(
      (await request(app).post(url).set("Authorization", `Bearer ${client.token}`)).status,
    ).toBe(404);
    expect((await request(app).post(url)).status).toBe(401);
  });
});
