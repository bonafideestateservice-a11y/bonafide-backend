import request from "supertest";
import app from "../../../../../app";
import { prismaClient } from "../../../../../utils/prisma";
import { createFixtures } from "../../../../helpers/fixtures";

const fx = createFixtures("property-locations");
// Unique names so other tests' properties don't affect what's checked.
const area = `Lekki ${Date.now()}`;
const city = `Lagos ${Date.now()}`;

beforeAll(async () => {
  await fx.createProperty({ area, city });
  await fx.createProperty({ area, city }); // the same location only appears once
  await fx.createProperty({ area: `${area} hidden`, city, isPublished: false });
  await fx.createProperty({ area: `${area} gone`, city, deletedAt: new Date() });
});
afterAll(async () => {
  await fx.cleanup();
  await prismaClient.$disconnect();
});

describe("GET /api/v1/client/properties/locations", () => {
  it("lists each published location once, without logging in", async () => {
    const response = await request(app).get("/api/v1/client/properties/locations");

    expect(response.status).toBe(200);
    const mine = response.body.data.filter((l: { city: string }) => l.city === city);
    expect(mine).toEqual([{ area, city, label: `${area}, ${city}` }]);
  });

  it("isn't mistaken for a property id", async () => {
    const response = await request(app).get("/api/v1/client/properties/locations");
    expect(response.body.message).toBeUndefined();
  });
});
