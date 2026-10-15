import request from "supertest";
import app from "../../../../../app";
import { prismaClient } from "../../../../../utils/prisma";
import { createFixtures } from "../../../../helpers/fixtures";

const fx = createFixtures("property-options");
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

const get = (token?: string) => {
  const call = request(app).get("/api/v1/admin/properties/options");
  return token ? call.set("Authorization", `Bearer ${token}`) : call;
};

describe("GET /api/v1/admin/properties/options", () => {
  it("returns the types and amenities the form can send", async () => {
    const response = await get(adminToken);

    expect(response.status).toBe(200);
    expect(response.body.types.map((t: { value: string }) => t.value)).toEqual([
      "HOUSE",
      "APARTMENT",
      "LAND",
      "COMMERCIAL",
    ]);
    expect(response.body.amenities).toContainEqual({ value: "ROAD_ACCESS", label: "Road Access" });
  });

  it("isn't mistaken for a property id, and is admin only", async () => {
    expect((await get(adminToken)).body.message).toBeUndefined();
    expect((await get()).status).toBe(401);
    expect((await get(clientToken)).status).toBe(403);
  });
});
