import { getPropertyLocationsHandler } from "../../../../../api/client/properties/handlers/get-property-locations";
import { getPropertyLocations } from "../../../../../api/client/properties/services/database/property";
import { callHandler, errorStatus } from "../../../../helpers/http";

jest.mock("../../../../../api/client/properties/services/database/property");
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedLocations = getPropertyLocations as jest.Mock;

describe("getPropertyLocationsHandler (unit)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns the locations", async () => {
    const locations = [{ area: "Lekki", city: "Lagos", label: "Lekki, Lagos" }];
    mockedLocations.mockResolvedValue(locations);
    const { res } = await callHandler(getPropertyLocationsHandler);
    expect(res.json).toHaveBeenCalledWith({ data: locations });
  });

  it("returns 500 when the query fails", async () => {
    mockedLocations.mockRejectedValue(new Error("db down"));
    expect(errorStatus((await callHandler(getPropertyLocationsHandler)).next)).toBe(500);
  });
});
