jest.mock("cloudinary", () => ({
  v2: {
    config: jest.fn(),
    uploader: { upload: jest.fn(async () => ({ secure_url: "https://cdn.test/photo.png" })) },
  },
}));

import request from "supertest";
import app from "../../../../../app";
import { prismaClient } from "../../../../../utils/prisma";
import { createFixtures } from "../../../../helpers/fixtures";

const fx = createFixtures("add-property");
let token: string;
const png = Buffer.from("89504e470d0a1a0a", "hex");

beforeAll(async () => {
  token = (await fx.createUser("ADMIN", "admin")).token;
});
afterAll(async () => {
  await fx.cleanup();
  await prismaClient.$disconnect();
});

const post = () =>
  request(app).post("/api/v1/admin/properties").set("Authorization", `Bearer ${token}`);

describe("POST /api/v1/admin/properties", () => {
  it("saves and publishes a property with its details and photos", async () => {
    const response = await post()
      .field("title", `Ocean View Villa ${fx.tag}`)
      .field("propertyType", "RESIDENTIAL")
      .field("priceAmount", "3,500,000,000")
      .field("location", "Banana Island, Lagos")
      .field("bedrooms", "5")
      .field("sizeSqm", "420.5")
      .field("amenities", "SWIMMING_POOL")
      .field("amenities", "GYM")
      .field("isPublished", "true")
      .attach("coverImage", png, { filename: "cover.png", contentType: "image/png" })
      .attach("images", png, { filename: "1.png", contentType: "image/png" });

    expect(response.status).toBe(201);
    fx.trackProperty(response.body.id);
    expect(response.body).toMatchObject({
      title: `Ocean View Villa ${fx.tag}`,
      location: { area: "Banana Island", city: "Lagos" },
      price: { amount: 3500000000, currency: "NGN" }, // over the old Int limit
      bedrooms: 5,
      sizeSqm: 420.5,
      amenities: ["SWIMMING_POOL", "GYM"],
      coverImageUrl: "https://cdn.test/photo.png",
      imageUrls: ["https://cdn.test/photo.png"],
      isPublished: true,
    });

    // It shows up in the properties list.
    const list = await request(app)
      .get(`/api/v1/admin/properties?search=${encodeURIComponent(fx.tag)}`)
      .set("Authorization", `Bearer ${token}`);
    expect(list.body.data.map((p: { id: string }) => p.id)).toContain(response.body.id);
  });

  it("saves a draft without photos", async () => {
    const response = await post()
      .field("title", `Draft ${fx.tag}`)
      .field("propertyType", "LAND")
      .field("priceAmount", "35000000")
      .field("location", "Ibeju-Lekki");
    expect(response.status).toBe(201);
    fx.trackProperty(response.body.id);
    expect(response.body).toMatchObject({
      isPublished: false,
      coverImageUrl: null,
      location: { area: "Ibeju-Lekki", city: null },
    });
  });

  it("rejects missing fields, non-image files and too many photos", async () => {
    expect((await post().field("propertyType", "LAND")).status).toBe(400);
    const pdf = await post()
      .field("title", "x")
      .attach("coverImage", Buffer.from("%PDF"), {
        filename: "a.pdf",
        contentType: "application/pdf",
      });
    expect(pdf.status).toBe(400);
    let tooMany = post().field("title", "x");
    for (let i = 0; i < 5; i += 1) {
      tooMany = tooMany.attach("images", png, { filename: `${i}.png`, contentType: "image/png" });
    }
    expect((await tooMany).status).toBe(400);
  });
});
