import { NextFunction, Request, Response } from "express";
import getAllProperties from "../../../../../api/admin/dashboard/handlers/get-all-properties";
import { getAllProperties as getAllPropertiesFromDatabase } from "../../../../../api/admin/dashboard/services/database/property";
import { HttpStatusCode } from "../../../../../exceptions";

jest.mock("../../../../../api/admin/dashboard/services/database/property");
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedGetAllProperties = getAllPropertiesFromDatabase as jest.Mock;

function buildMockReqRes(query: Record<string, unknown>) {
  const req = { query } as unknown as Request;
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response;
  const next = jest.fn() as NextFunction;
  return { req, res, next };
}

describe("getAllProperties handler (unit)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("passes query parameters and maps the property response", async () => {
    const property = {
      id: "property-1",
      title: "4 Bedroom Duplex",
      name: "Legacy name",
      propertyType: "RESIDENTIAL",
      area: "Lekki Phase 1",
      city: "Lagos",
      country: "Nigeria",
      priceAmount: 85000000,
      priceCurrency: "NGN",
      viewCount: 1500,
      coverImageUrl: "https://example.com/duplex.jpg",
      isPublished: true,
      createdAt: new Date("2026-01-02T00:00:00.000Z"),
    };
    const result = {
      data: [property],
      meta: { page: 1, limit: 12, totalItems: 1, totalPages: 1 },
      counts: { all: 1, published: 1, unpublished: 0 },
    };
    mockedGetAllProperties.mockResolvedValue(result);
    const { req, res, next } = buildMockReqRes({
      status: "published",
      search: "Lekki",
      type: "RESIDENTIAL",
      page: "1",
      limit: "12",
      sortBy: "price",
      sortOrder: "desc",
    });

    await getAllProperties(req, res, next);

    expect(mockedGetAllProperties).toHaveBeenCalledWith({
      status: "published",
      search: "Lekki",
      type: "RESIDENTIAL",
      page: 1,
      limit: 12,
      sortBy: "price",
      sortOrder: "desc",
    });
    expect(res.status).toHaveBeenCalledWith(HttpStatusCode.OK);
    expect(res.json).toHaveBeenCalledWith({
      data: [
        {
          id: "property-1",
          title: "4 Bedroom Duplex",
          type: "RESIDENTIAL",
          location: { area: "Lekki Phase 1", city: "Lagos", country: "Nigeria" },
          price: { amount: 85000000, currency: "NGN" },
          viewCount: 1500,
          coverImageUrl: "https://example.com/duplex.jpg",
          isPublished: true,
          createdAt: "2026-01-02T00:00:00.000Z",
        },
      ],
      meta: result.meta,
      counts: result.counts,
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects an invalid status", async () => {
    const { req, res, next } = buildMockReqRes({ status: "archived" });

    await getAllProperties(req, res, next);

    expect(res.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.BAD_REQUEST }),
    );
  });
});
