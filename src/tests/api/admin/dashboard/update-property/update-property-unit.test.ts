const upload = jest.fn(async () => ({ secure_url: "https://cdn.test/new.png" }));
jest.mock("cloudinary", () => ({ v2: { config: jest.fn(), uploader: { upload } } }));
jest.mock("../../../../../api/admin/dashboard/services/database/property");
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

import { updatePropertyHandler } from "../../../../../api/admin/dashboard/handlers/update-property";
import {
  findProperty,
  updateProperty,
} from "../../../../../api/admin/dashboard/services/database/property";
import { callHandler, errorStatus } from "../../../../helpers/http";

const mockedFind = findProperty as jest.Mock;
const mockedUpdate = updateProperty as jest.Mock;
const file = { mimetype: "image/png", buffer: Buffer.from("x") };
const current = {
  id: "p1",
  coverImageUrl: "https://cdn.test/cover.png",
  imageUrls: ["https://cdn.test/a.png", "https://cdn.test/b.png"],
};

const call = (body: Record<string, unknown>, files: Record<string, unknown> = {}) =>
  callHandler(updatePropertyHandler, { params: { id: "p1" }, body, files });

describe("updatePropertyHandler (unit)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedFind.mockResolvedValue(current);
    mockedUpdate.mockImplementation(async (id, data) => ({
      ...current,
      ...data,
      id,
      priceAmount: BigInt(1),
      createdAt: new Date(),
    }));
  });

  it("changes only the fields sent", async () => {
    const { res } = await call({ title: " New title ", bedrooms: "", amenities: "GYM" });

    expect(mockedUpdate).toHaveBeenCalledWith("p1", {
      name: "New title",
      bedrooms: null,
      amenities: ["GYM"],
      coverImageUrl: current.coverImageUrl,
      imageUrls: current.imageUrls,
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0]).toMatchObject({ id: "p1", title: "New title" });
  });

  it("removes photos and adds new ones", async () => {
    await call(
      { removeImageUrls: ["https://cdn.test/a.png", current.coverImageUrl] },
      { images: [file] },
    );

    expect(mockedUpdate.mock.calls[0][1]).toMatchObject({
      coverImageUrl: null,
      imageUrls: ["https://cdn.test/b.png", "https://cdn.test/new.png"],
    });
  });

  it("replaces the cover when a new one is sent", async () => {
    await call({}, { coverImage: [file] });
    expect(mockedUpdate.mock.calls[0][1].coverImageUrl).toBe("https://cdn.test/new.png");
  });

  it("returns 400 when there would be more than 4 other photos", async () => {
    const { next } = await call({}, { images: [file, file, file] });
    expect(errorStatus(next)).toBe(400);
    expect(upload).not.toHaveBeenCalled();
  });

  it.each([
    [{ title: "" }],
    [{ propertyType: "CASTLE" }],
    [{ priceAmount: "abc" }],
    [{ location: " " }],
    [{ amenities: "MOAT" }],
  ])("returns 400 for invalid fields %j", async (body) => {
    const { next } = await call(body);
    expect(errorStatus(next)).toBe(400);
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it("returns 404 when the property is missing or deleted", async () => {
    mockedFind.mockResolvedValue(null);
    const { next } = await call({ title: "x" });
    expect(errorStatus(next)).toBe(404);
  });

  it("returns 500 when the update fails", async () => {
    mockedUpdate.mockRejectedValue(new Error("db down"));
    const { next } = await call({ title: "x" });
    expect(errorStatus(next)).toBe(500);
  });
});
