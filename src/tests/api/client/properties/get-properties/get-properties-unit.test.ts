import { getPropertiesHandler } from "../../../../../api/client/properties/handlers/get-properties";
import { getAllProperties } from "../../../../../api/admin/dashboard/services/database/property";
import { callHandler, errorStatus } from "../../../../helpers/http";

jest.mock("../../../../../api/admin/dashboard/services/database/property");
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedList = getAllProperties as jest.Mock;
const property = {
  id: "p1",
  number: 1,
  name: "Lekki Phase 1 Apartment",
  propertyType: "APARTMENT",
  area: "Lekki",
  city: "Lagos",
  priceAmount: BigInt(85000000),
  bedrooms: 3,
  bathrooms: 3,
  amenities: ["PARKING"],
  createdAt: new Date("2026-10-01T00:00:00.000Z"),
};

describe("getPropertiesHandler (unit)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedList.mockResolvedValue({
      data: [property],
      meta: { page: 1, limit: 12, totalItems: 1, totalPages: 1 },
      counts: { all: 1, published: 1, unpublished: 0 },
    });
  });

  it("searches published properties with every filter", async () => {
    const { res } = await callHandler(getPropertiesHandler, {
      query: {
        search: " Lekki ",
        type: "APARTMENT",
        minPrice: "50,000,000",
        maxPrice: "100000000",
        area: "Lekki",
        city: "Lagos",
        page: "2",
        limit: "6",
      },
    });

    expect(mockedList).toHaveBeenCalledWith({
      status: "published",
      search: "Lekki",
      type: "APARTMENT",
      minPrice: 50000000,
      maxPrice: 100000000,
      area: "Lekki",
      city: "Lagos",
      page: 2,
      limit: 6,
    });
    const body = res.json.mock.calls[0][0];
    expect(body.meta.totalItems).toBe(1);
    expect(body.counts).toBeUndefined(); // the admin tab counts aren't exposed
    expect(body.data[0]).toMatchObject({
      id: "p1",
      title: "Lekki Phase 1 Apartment",
      type: "APARTMENT",
      location: { area: "Lekki", city: "Lagos" },
      price: { amount: 85000000 },
      bedrooms: 3,
      amenities: ["PARKING"],
    });
  });

  it("uses no filters by default", async () => {
    await callHandler(getPropertiesHandler);
    expect(mockedList).toHaveBeenCalledWith(
      expect.objectContaining({ status: "published", search: "", page: 1, limit: 12 }),
    );
  });

  it.each([
    [{ type: "RESIDENTIAL" }],
    [{ minPrice: "cheap" }],
    [{ maxPrice: "-5" }],
    [{ minPrice: "20000000", maxPrice: "10000000" }],
    [{ limit: "101" }],
  ])("returns 400 for query %j", async (query) => {
    const { next } = await callHandler(getPropertiesHandler, { query });
    expect(errorStatus(next)).toBe(400);
    expect(mockedList).not.toHaveBeenCalled();
  });

  it("returns 500 when the query fails", async () => {
    mockedList.mockRejectedValue(new Error("db down"));
    expect(errorStatus((await callHandler(getPropertiesHandler)).next)).toBe(500);
  });
});
