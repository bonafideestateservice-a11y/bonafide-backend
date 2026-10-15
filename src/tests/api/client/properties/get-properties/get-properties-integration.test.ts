import request from "supertest";
import app from "../../../../../app";
import { prismaClient } from "../../../../../utils/prisma";
import { createFixtures } from "../../../../helpers/fixtures";

const fx = createFixtures("explore-properties");
const ids: Record<string, string> = {};

beforeAll(async () => {
  const make = async (key: string, data: object) =>
    (ids[key] = (await fx.createProperty({ name: `${key} ${fx.tag}`, ...data })).id);
  await make("apartment", {
    propertyType: "APARTMENT",
    area: "Lekki",
    city: "Lagos",
    priceAmount: BigInt(85000000),
  });
  await make("house", {
    propertyType: "HOUSE",
    area: "Ikoyi",
    city: "Lagos",
    priceAmount: BigInt(250000000),
  });
  await make("land", {
    propertyType: "LAND",
    area: "Epe",
    city: "Lagos",
    priceAmount: BigInt(25000000),
    amenities: ["ROAD_ACCESS"],
  });
  await make("draft", {
    propertyType: "APARTMENT",
    area: "Lekki",
    city: "Lagos",
    isPublished: false,
  });
  await make("deleted", {
    propertyType: "APARTMENT",
    area: "Lekki",
    city: "Lagos",
    deletedAt: new Date(),
  });
});
afterAll(async () => {
  await fx.cleanup();
  await prismaClient.$disconnect();
});

const explore = (query: string) =>
  request(app).get(`/api/v1/client/properties?search=${encodeURIComponent(fx.tag)}&${query}`);
const idsOf = (body: { data: { id: string }[] }) => body.data.map((p) => p.id).sort();

describe("GET /api/v1/client/properties", () => {
  it("lists only published properties, without logging in", async () => {
    const response = await explore("");
    expect(response.status).toBe(200);
    expect(idsOf(response.body)).toEqual([ids.apartment, ids.house, ids.land].sort());
    expect(response.body.meta.totalItems).toBe(3);
  });

  it("filters by type, price range and location", async () => {
    expect(idsOf((await explore("type=APARTMENT")).body)).toEqual([ids.apartment]);
    expect(idsOf((await explore("minPrice=50000000&maxPrice=100000000")).body)).toEqual([
      ids.apartment,
    ]);
    expect(idsOf((await explore("area=lekki&city=lagos")).body)).toEqual([ids.apartment]);
    const land = (await explore("type=LAND")).body.data[0];
    expect(land.amenities).toEqual(["ROAD_ACCESS"]);
  });

  it("returns an empty list when nothing matches", async () => {
    const response = await explore("city=Abuja");
    expect(response.body).toMatchObject({ data: [], meta: { totalItems: 0 } });
  });

  it("returns 400 for an unknown type", async () => {
    expect((await explore("type=RESIDENTIAL")).status).toBe(400);
  });
});
