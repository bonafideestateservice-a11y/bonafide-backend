import { getPropertyHandler } from "../../../../../api/client/properties/handlers/get-property";
import {
  isPropertyFavorite,
  viewProperty,
} from "../../../../../api/client/properties/services/database/property";
import { callHandler, errorStatus } from "../../../../helpers/http";

jest.mock("../../../../../api/client/properties/services/database/property");
jest.mock("../../../../../utils/jwt", () => ({
  extractTokenFromHeaders: (req: { headers: { authorization?: string } }) =>
    req.headers.authorization?.split(" ")[1] ?? null,
  verifyToken: async (token: string) => {
    if (token !== "valid-token") throw new Error("invalid");
    return { id: "u1" };
  },
}));
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedView = viewProperty as jest.Mock;
const mockedIsFavorite = isPropertyFavorite as jest.Mock;
const date = new Date("2026-10-01T00:00:00.000Z");
const property = {
  id: "p1",
  number: 1,
  name: "Villa",
  priceAmount: BigInt(10),
  status: "VERIFIED",
  verifiedAt: date,
  createdAt: date,
};
const withToken = (token: string) => ({
  params: { id: "p1" },
  headers: { authorization: `Bearer ${token}` },
});

describe("getPropertyHandler (client, unit)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedView.mockResolvedValue(property);
    mockedIsFavorite.mockResolvedValue(true);
  });

  it("counts the view and returns the property without a token", async () => {
    const { res } = await callHandler(getPropertyHandler, { params: { id: "p1" }, headers: {} });

    expect(mockedView).toHaveBeenCalledWith("p1");
    expect(mockedIsFavorite).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0]).toMatchObject({
      id: "p1",
      title: "Villa",
      status: "VERIFIED",
      verifiedAt: date.toISOString(),
      isFavorite: false,
    });
  });

  it("says whether the signed-in user saved it", async () => {
    const { res } = await callHandler(getPropertyHandler, withToken("valid-token"));
    expect(mockedIsFavorite).toHaveBeenCalledWith("u1", "p1");
    expect(res.json.mock.calls[0][0].isFavorite).toBe(true);
  });

  it("ignores an invalid token", async () => {
    const { res } = await callHandler(getPropertyHandler, withToken("not-a-token"));
    expect(res.json.mock.calls[0][0].isFavorite).toBe(false);
  });

  it("returns 404 when the property isn't published", async () => {
    mockedView.mockRejectedValue(Object.assign(new Error("not found"), { code: "P2025" }));
    const { next } = await callHandler(getPropertyHandler, { params: { id: "p1" }, headers: {} });
    expect(errorStatus(next)).toBe(404);
  });

  it("returns 500 when the query fails", async () => {
    mockedView.mockRejectedValue(new Error("db down"));
    const { next } = await callHandler(getPropertyHandler, { params: { id: "p1" }, headers: {} });
    expect(errorStatus(next)).toBe(500);
  });
});
