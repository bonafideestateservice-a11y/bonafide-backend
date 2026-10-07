jest.mock("cloudinary", () => ({
  v2: {
    config: jest.fn(),
    uploader: { upload: jest.fn(async () => ({ secure_url: "https://cdn.test/new.png" })) },
  },
}));

import request from "supertest";
import app from "../../../../../app";
import { prismaClient } from "../../../../../utils/prisma";
import { createFixtures } from "../../../../helpers/fixtures";

const fx = createFixtures("admin-update-property");
let adminToken: string;
let clientToken: string;
const png = Buffer.from("89504e470d0a1a0a", "hex");

beforeAll(async () => {
  adminToken = (await fx.createUser("ADMIN", "admin")).token;
  clientToken = (await fx.createUser("CLIENT", "client")).token;
});
afterAll(async () => {
  await fx.cleanup();
  await prismaClient.$disconnect();
});

const patch = (id: string, token = adminToken) =>
  request(app).patch(`/api/v1/admin/properties/${id}`).set("Authorization", `Bearer ${token}`);

describe("PATCH /api/v1/admin/properties/:id", () => {
  it("updates the fields sent and the photos", async () => {
    const property = await fx.createProperty({
      bedrooms: 3,
      amenities: ["GYM"],
      imageUrls: ["https://cdn.test/a.png"],
    });

    const response = await patch(property.id)
      .field("title", "Renamed")
      .field("priceAmount", "1,000,000")
      .field("location", "Ikoyi, Lagos")
      .field("removeImageUrls", "https://cdn.test/a.png")
      .attach("images", png, { filename: "1.png", contentType: "image/png" });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: property.id,
      title: "Renamed",
      price: { amount: 1000000 },
      location: { area: "Ikoyi", city: "Lagos" },
      bedrooms: 3,
      amenities: ["GYM"],
      imageUrls: ["https://cdn.test/new.png"],
    });
  });

  it("returns 400 for invalid fields", async () => {
    const property = await fx.createProperty();
    expect((await patch(property.id).field("propertyType", "CASTLE")).status).toBe(400);
  });

  it("returns 404 for deleted and unknown properties", async () => {
    const deleted = await fx.createProperty({ deletedAt: new Date() });
    expect((await patch(deleted.id).field("title", "x")).status).toBe(404);
    expect((await patch("missing").field("title", "x")).status).toBe(404);
  });

  it("returns 401 without a token and 403 for non-admins", async () => {
    const property = await fx.createProperty();
    expect((await request(app).patch(`/api/v1/admin/properties/${property.id}`)).status).toBe(401);
    expect((await patch(property.id, clientToken).field("title", "x")).status).toBe(403);
  });
});
