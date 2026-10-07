import { getPropertyHandler } from "../../../../../api/admin/dashboard/handlers/get-property";
import { getPropertyDetail } from "../../../../../api/admin/dashboard/services/database/property";
import { callHandler, errorStatus } from "../../../../helpers/http";

jest.mock("../../../../../api/admin/dashboard/services/database/property");
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedDetail = getPropertyDetail as jest.Mock;
const date = new Date("2026-10-01T00:00:00.000Z");

describe("getPropertyHandler (admin, unit)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns the property with its stats and dates", async () => {
    mockedDetail.mockResolvedValue({
      id: "p1",
      number: 7,
      name: "Villa",
      priceAmount: BigInt(5000),
      viewCount: 12,
      status: "VERIFIED",
      verifiedAt: date,
      createdAt: date,
      updatedAt: date,
      _count: { inquiries: 3, favorites: 4 },
    });

    const { res } = await callHandler(getPropertyHandler, { params: { id: "p1" } });

    expect(mockedDetail).toHaveBeenCalledWith("p1");
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0]).toMatchObject({
      id: "p1",
      number: 7,
      title: "Villa",
      price: { amount: 5000 },
      status: "VERIFIED",
      verifiedAt: date.toISOString(),
      updatedAt: date.toISOString(),
      stats: { views: 12, inquiries: 3, favorites: 4 },
    });
  });

  it("returns 404 when the property is missing or deleted", async () => {
    mockedDetail.mockResolvedValue(null);
    const { next } = await callHandler(getPropertyHandler, { params: { id: "x" } });
    expect(errorStatus(next)).toBe(404);
  });

  it("returns 500 when the query fails", async () => {
    mockedDetail.mockRejectedValue(new Error("db down"));
    const { next } = await callHandler(getPropertyHandler, { params: { id: "x" } });
    expect(errorStatus(next)).toBe(500);
  });
});
