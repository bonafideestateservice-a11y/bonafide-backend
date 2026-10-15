import { getPropertyRequestsHandler } from "../../../../../api/client/properties/handlers/get-property-requests";
import { listPropertyRequests } from "../../../../../api/services/database/property-request";
import { callHandler, errorStatus } from "../../../../helpers/http";

jest.mock("../../../../../api/services/database/property-request");
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedList = listPropertyRequests as jest.Mock;
const call = (query: Record<string, string> = {}) =>
  callHandler(getPropertyRequestsHandler, { query, user: { id: "u1" } });

describe("getPropertyRequestsHandler (unit)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("lists only the client's requests, filtered", async () => {
    const page = { data: [], meta: { page: 1 } };
    mockedList.mockResolvedValue(page);
    const { res } = await call({ type: "PURCHASE", status: "IN_PROGRESS", page: "2", limit: "5" });
    expect(mockedList).toHaveBeenCalledWith(
      { userId: "u1", type: "PURCHASE", status: "IN_PROGRESS" },
      2,
      5,
    );
    expect(res.json).toHaveBeenCalledWith(page);
  });

  it.each([[{ type: "RENT" }], [{ status: "PAID" }], [{ page: "0" }]])(
    "returns 400 for %j",
    async (query) => {
      expect(errorStatus((await call(query)).next)).toBe(400);
      expect(mockedList).not.toHaveBeenCalled();
    },
  );

  it("returns 500 when the query fails", async () => {
    mockedList.mockRejectedValue(new Error("db down"));
    expect(errorStatus((await call()).next)).toBe(500);
  });
});
