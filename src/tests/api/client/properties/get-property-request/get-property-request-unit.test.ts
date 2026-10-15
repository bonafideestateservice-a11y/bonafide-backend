import { getPropertyRequestHandler } from "../../../../../api/client/properties/handlers/get-property-request";
import {
  findPropertyRequest,
  toRequestResponse,
} from "../../../../../api/services/database/property-request";
import { callHandler, errorStatus } from "../../../../helpers/http";

jest.mock("../../../../../api/services/database/property-request");
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedFind = findPropertyRequest as jest.Mock;
(toRequestResponse as jest.Mock).mockImplementation((request) => ({ id: request.id }));
const call = () =>
  callHandler(getPropertyRequestHandler, { params: { id: "r1" }, user: { id: "u1" } });

describe("getPropertyRequestHandler (unit)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns the client's own request", async () => {
    mockedFind.mockResolvedValue({ id: "r1" });
    const { res } = await call();
    expect(mockedFind).toHaveBeenCalledWith({ id: "r1", userId: "u1" });
    expect(res.json).toHaveBeenCalledWith({ id: "r1" });
  });

  it("returns 404 for another client's or an unknown request", async () => {
    mockedFind.mockResolvedValue(null);
    expect(errorStatus((await call()).next)).toBe(404);
  });

  it("returns 500 when the query fails", async () => {
    mockedFind.mockRejectedValue(new Error("db down"));
    expect(errorStatus((await call()).next)).toBe(500);
  });
});
