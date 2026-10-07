import { removePropertyFavoriteHandler } from "../../../../../api/client/properties/handlers/remove-property-favorite";
import { removePropertyFavorite } from "../../../../../api/client/properties/services/database/property";
import { callHandler, errorStatus } from "../../../../helpers/http";

jest.mock("../../../../../api/client/properties/services/database/property");
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedRemove = removePropertyFavorite as jest.Mock;
const call = () =>
  callHandler(removePropertyFavoriteHandler, { params: { id: "p1" }, user: { id: "u1" } });

describe("removePropertyFavoriteHandler (unit)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("removes the favorite", async () => {
    mockedRemove.mockResolvedValue({ count: 1 });
    const { res } = await call();
    expect(mockedRemove).toHaveBeenCalledWith("u1", "p1");
    expect(res.json).toHaveBeenCalledWith({ propertyId: "p1", isFavorite: false });
  });

  it("returns 500 when the query fails", async () => {
    mockedRemove.mockRejectedValue(new Error("db down"));
    const { next } = await call();
    expect(errorStatus(next)).toBe(500);
  });
});
