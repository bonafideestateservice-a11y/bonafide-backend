const upload = jest.fn();
jest.mock("cloudinary", () => ({ v2: { config: jest.fn(), uploader: { upload } } }));
jest.mock("../../../../../api/admin/dashboard/services/database/property", () => ({
  createProperty: jest.fn(),
}));
jest.mock("../../../../../api/services/database/activity-log", () => ({
  recordPropertyAdded: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../../../../utils/logger", () => ({ logger: { error: jest.fn(), info: jest.fn() } }));

import { createPropertyHandler } from "../../../../../api/admin/dashboard/handlers/create-property";
import { createProperty } from "../../../../../api/admin/dashboard/services/database/property";
import { recordPropertyAdded } from "../../../../../api/services/database/activity-log";
import { callHandler, errorStatus } from "../../../../helpers/http";

const create = createProperty as jest.Mock;
const file = (name: string) => ({ mimetype: "image/png", buffer: Buffer.from(name) });
const validBody = {
  title: " Ocean View Villa ",
  propertyType: "RESIDENTIAL",
  priceAmount: "85,000,000",
  location: "Lekki Phase 1, Lagos",
};

describe("createPropertyHandler (unit)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    upload.mockImplementation(async () => ({
      secure_url: `https://cdn.test/${upload.mock.calls.length}.png`,
    }));
    create.mockImplementation(async (data) => ({
      id: "p1",
      viewCount: 0,
      priceCurrency: "NGN",
      country: null,
      createdAt: new Date("2026-10-09T00:00:00Z"),
      ...data,
    }));
  });

  it("records a Property Added activity with the admin's name", async () => {
    await callHandler(createPropertyHandler, {
      body: validBody,
      user: { fullName: "Sarah Wilson" },
    });
    expect(recordPropertyAdded).toHaveBeenCalledWith(
      expect.objectContaining({ id: "p1", name: "Ocean View Villa" }),
      "Sarah Wilson",
    );
  });

  it("still returns the property when recording the activity fails", async () => {
    (recordPropertyAdded as jest.Mock).mockRejectedValueOnce(new Error("db down"));
    const { res } = await callHandler(createPropertyHandler, { body: validBody });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("creates the property from the form and returns it", async () => {
    const { res } = await callHandler(createPropertyHandler, {
      body: {
        ...validBody,
        description: "Sea views",
        bedrooms: "5",
        sizeSqm: "350.5",
        amenities: ["PARKING", "GYM"],
        isPublished: "true",
      },
      files: { coverImage: [file("cover")], images: [file("a"), file("b")] },
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Ocean View Villa",
        address: "Lekki Phase 1, Lagos",
        area: "Lekki Phase 1",
        city: "Lagos",
        priceAmount: BigInt(85000000),
        bedrooms: 5,
        sizeSqm: 350.5,
        amenities: ["PARKING", "GYM"],
        coverImageUrl: expect.stringContaining("https://cdn.test/"),
        imageUrls: [expect.any(String), expect.any(String)],
        isPublished: true,
      }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json.mock.calls[0][0]).toMatchObject({
      title: "Ocean View Villa",
      price: { amount: 85000000, currency: "NGN" },
      location: { area: "Lekki Phase 1", city: "Lagos" },
    });
  });

  it("saves a draft with a single amenity and no images", async () => {
    await callHandler(createPropertyHandler, { body: { ...validBody, amenities: "GARDEN" } });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        amenities: ["GARDEN"],
        isPublished: false,
        coverImageUrl: null,
        imageUrls: [],
      }),
    );
    expect(upload).not.toHaveBeenCalled();
  });

  it.each([
    ["no title", { title: "" }],
    ["an unknown type", { propertyType: "CASTLE" }],
    ["no price", { priceAmount: "" }],
    ["a negative bedroom count", { bedrooms: "-1" }],
    ["a fractional bedroom count", { bedrooms: "2.5" }],
    ["no location", { location: " " }],
    ["an unknown amenity", { amenities: ["HELIPAD"] }],
  ])("rejects %s", async (_label, change) => {
    const { next } = await callHandler(createPropertyHandler, {
      body: { ...validBody, ...change },
    });
    expect(errorStatus(next)).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it("returns 500 when saving fails", async () => {
    create.mockRejectedValue(new Error("db down"));
    const { next } = await callHandler(createPropertyHandler, { body: validBody });
    expect(errorStatus(next)).toBe(500);
  });
});
