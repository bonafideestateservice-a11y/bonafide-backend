import { createPropertyRequestNoticeHandler } from "../../../../../api/admin/dashboard/handlers/create-property-request-notice";
import {
  addPropertyRequestNotice,
  toAdminRequestResponse,
} from "../../../../../api/services/database/property-request";
import { callHandler, errorStatus } from "../../../../helpers/http";

jest.mock("../../../../../api/services/database/property-request");
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedAdd = addPropertyRequestNotice as jest.Mock;
(toAdminRequestResponse as jest.Mock).mockImplementation((request) => ({ id: request.id }));
const call = (body: unknown) =>
  callHandler(createPropertyRequestNoticeHandler, { params: { id: "r1" }, body });

describe("createPropertyRequestNoticeHandler (unit)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("adds the trimmed notice", async () => {
    mockedAdd.mockResolvedValue({ id: "r1" });
    const { res } = await call({ title: " Purchase notice ", message: " Send your ID. " });
    expect(mockedAdd).toHaveBeenCalledWith("r1", "Purchase notice", "Send your ID.");
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ id: "r1" });
  });

  it.each([
    [{ message: "x" }],
    [{ title: "x" }],
    [{ title: " ", message: "x" }],
    [{ title: "x".repeat(121), message: "x" }],
    [{ title: "x", message: "x".repeat(1001) }],
  ])("returns 400 for %j", async (body) => {
    expect(errorStatus((await call(body)).next)).toBe(400);
    expect(mockedAdd).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown request and 500 on errors", async () => {
    mockedAdd.mockResolvedValueOnce(null);
    expect(errorStatus((await call({ title: "t", message: "m" })).next)).toBe(404);
    mockedAdd.mockRejectedValueOnce(new Error("db down"));
    expect(errorStatus((await call({ title: "t", message: "m" })).next)).toBe(500);
  });
});
