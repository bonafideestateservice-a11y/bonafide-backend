import { getAdminPropertyRequestHandler } from "../../../../../api/admin/dashboard/handlers/get-property-request-detail";
import {
  findPropertyRequest,
  toAdminRequestResponse,
} from "../../../../../api/services/database/property-request";
import { callHandler, errorStatus } from "../../../../helpers/http";

jest.mock("../../../../../api/services/database/property-request");
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedFind = findPropertyRequest as jest.Mock;
(toAdminRequestResponse as jest.Mock).mockImplementation((request) => ({ id: request.id }));
const call = () => callHandler(getAdminPropertyRequestHandler, { params: { id: "r1" } });

describe("getAdminPropertyRequestHandler (unit)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns any client's request", async () => {
    mockedFind.mockResolvedValue({ id: "r1" });
    const { res } = await call();
    expect(mockedFind).toHaveBeenCalledWith({ id: "r1" });
    expect(res.json).toHaveBeenCalledWith({ id: "r1" });
  });

  it("returns 404 for an unknown request and 500 on errors", async () => {
    mockedFind.mockResolvedValueOnce(null);
    expect(errorStatus((await call()).next)).toBe(404);
    mockedFind.mockRejectedValueOnce(new Error("db down"));
    expect(errorStatus((await call()).next)).toBe(500);
  });
});
