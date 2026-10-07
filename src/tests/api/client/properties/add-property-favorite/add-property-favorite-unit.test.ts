import { addPropertyFavoriteHandler } from "../../../../../api/client/properties/handlers/add-property-favorite";
import {
  addPropertyFavorite,
  isPropertyVisible,
} from "../../../../../api/client/properties/services/database/property";
import { callHandler, errorStatus } from "../../../../helpers/http";

jest.mock("../../../../../api/client/properties/services/database/property");
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedVisible = isPropertyVisible as jest.Mock;
const mockedAdd = addPropertyFavorite as jest.Mock;
const call = () =>
  callHandler(addPropertyFavoriteHandler, { params: { id: "p1" }, user: { id: "u1" } });

describe("addPropertyFavoriteHandler (unit)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("saves the favorite", async () => {
    mockedVisible.mockResolvedValue(true);
    const { res } = await call();
    expect(mockedAdd).toHaveBeenCalledWith("u1", "p1");
    expect(res.json).toHaveBeenCalledWith({ propertyId: "p1", isFavorite: true });
  });

  it("returns 404 when the property isn't published", async () => {
    mockedVisible.mockResolvedValue(false);
    const { next } = await call();
    expect(errorStatus(next)).toBe(404);
    expect(mockedAdd).not.toHaveBeenCalled();
  });

  it("returns 500 when saving fails", async () => {
    mockedVisible.mockRejectedValue(new Error("db down"));
    const { next } = await call();
    expect(errorStatus(next)).toBe(500);
  });
});
