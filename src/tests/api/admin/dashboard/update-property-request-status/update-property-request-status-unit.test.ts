import { updatePropertyRequestStatusHandler } from "../../../../../api/admin/dashboard/handlers/update-property-request-status";
import {
  setPropertyRequestStatus,
  toAdminRequestResponse,
} from "../../../../../api/services/database/property-request";
import { callHandler, errorStatus } from "../../../../helpers/http";

jest.mock("../../../../../api/services/database/property-request");
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedSet = setPropertyRequestStatus as jest.Mock;
(toAdminRequestResponse as jest.Mock).mockImplementation((request) => ({ id: request.id }));
const call = (body: unknown) =>
  callHandler(updatePropertyRequestStatusHandler, { params: { id: "r1" }, body });

describe("updatePropertyRequestStatusHandler (unit)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("moves the request and saves the trimmed note", async () => {
    mockedSet.mockResolvedValue({ kind: "UPDATED", request: { id: "r1" } });
    const { res } = await call({ status: "CONSULTATION", note: "  Call booked  " });
    expect(mockedSet).toHaveBeenCalledWith("r1", "CONSULTATION", "Call booked");
    expect(res.json).toHaveBeenCalledWith({ id: "r1" });
  });

  it.each([
    [{}],
    [{ status: "PAID" }],
    [{ status: "CONSULTATION", note: 5 }],
    [{ status: "CONSULTATION", note: "x".repeat(1001) }],
  ])("returns 400 for %j", async (body) => {
    expect(errorStatus((await call(body)).next)).toBe(400);
    expect(mockedSet).not.toHaveBeenCalled();
  });

  it.each([
    [{ kind: "NOT_FOUND" }, 404],
    [{ kind: "FINISHED", status: "COMPLETED" }, 409],
    [{ kind: "NOT_A_PURCHASE" }, 400],
  ])("maps %j to %s", async (result, status) => {
    mockedSet.mockResolvedValue(result);
    expect(errorStatus((await call({ status: "IN_PROGRESS" })).next)).toBe(status);
  });

  it("returns 500 when saving fails", async () => {
    mockedSet.mockRejectedValue(new Error("db down"));
    expect(errorStatus((await call({ status: "IN_PROGRESS" })).next)).toBe(500);
  });
});
