import { getAdminPropertyRequestsHandler } from "../../../../../api/admin/dashboard/handlers/get-property-requests";
import {
  listPropertyRequests,
  toAdminRequestResponse,
} from "../../../../../api/services/database/property-request";
import { callHandler, errorStatus } from "../../../../helpers/http";

jest.mock("../../../../../api/services/database/property-request");
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedList = listPropertyRequests as jest.Mock;
const call = (query: Record<string, string> = {}) =>
  callHandler(getAdminPropertyRequestsHandler, { query });

describe("getAdminPropertyRequestsHandler (unit)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("lists every client's requests with filters and search, in the admin shape", async () => {
    mockedList.mockResolvedValue({ data: [], meta: {} });
    await call({ type: "PURCHASE", status: "SUBMITTED", search: " lekki " });
    expect(mockedList).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "PURCHASE",
        status: "SUBMITTED",
        OR: expect.arrayContaining([{ reference: { contains: "lekki", mode: "insensitive" } }]),
      }),
      1,
      20,
      toAdminRequestResponse,
    );
  });

  it.each([[{ type: "RENT" }], [{ status: "PAID" }], [{ limit: "101" }]])(
    "returns 400 for %j",
    async (query) => {
      expect(errorStatus((await call(query)).next)).toBe(400);
    },
  );

  it("returns 500 when the query fails", async () => {
    mockedList.mockRejectedValue(new Error("db down"));
    expect(errorStatus((await call()).next)).toBe(500);
  });
});
