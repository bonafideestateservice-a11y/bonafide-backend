import request from "supertest";
import app from "../../../../../app";
import { prismaClient } from "../../../../../utils/prisma";
import { createFixtures } from "../../../../helpers/fixtures";

const fx = createFixtures("client-remove-favorite");

afterAll(async () => {
  await fx.cleanup();
  await prismaClient.$disconnect();
});

const favorites = (propertyId: string) =>
  prismaClient.propertyFavorite.count({ where: { propertyId } });

describe("DELETE /api/v1/client/properties/:id/favorite", () => {
  it("removes only the user's favorite, and repeating it changes nothing", async () => {
    const client = await fx.createUser("CLIENT", "client");
    const other = await fx.createUser("CLIENT", "other");
    const property = await fx.createProperty();
    await prismaClient.propertyFavorite.createMany({
      data: [client, other].map((user) => ({ userId: user.id, propertyId: property.id })),
    });
    const unsave = () =>
      request(app)
        .delete(`/api/v1/client/properties/${property.id}/favorite`)
        .set("Authorization", `Bearer ${client.token}`);

    expect((await unsave()).body).toEqual({ propertyId: property.id, isFavorite: false });
    expect((await unsave()).status).toBe(200);
    expect(await favorites(property.id)).toBe(1);
  });

  it("returns 401 without a token", async () => {
    const property = await fx.createProperty();
    const response = await request(app).delete(`/api/v1/client/properties/${property.id}/favorite`);
    expect(response.status).toBe(401);
  });
});
