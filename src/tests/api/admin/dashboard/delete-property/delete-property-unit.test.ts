import { deletePropertyHandler } from "../../../../../api/admin/dashboard/handlers/delete-property";
import { deleteProperty } from "../../../../../api/admin/dashboard/services/database/property";
import { callHandler, errorStatus } from "../../../../helpers/http";

jest.mock("../../../../../api/admin/dashboard/services/database/property");
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedDelete = deleteProperty as jest.Mock;

describe("deletePropertyHandler (unit)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("soft deletes the property", async () => {
    mockedDelete.mockResolvedValue({ id: "p1" });
    const { res } = await callHandler(deletePropertyHandler, { params: { id: "p1" } });
    expect(mockedDelete).toHaveBeenCalledWith("p1");
    expect(res.json).toHaveBeenCalledWith({ id: "p1", deleted: true });
  });

  it("returns 404 when the property is missing or already deleted", async () => {
    mockedDelete.mockRejectedValue(Object.assign(new Error("not found"), { code: "P2025" }));
    const { next } = await callHandler(deletePropertyHandler, { params: { id: "p1" } });
    expect(errorStatus(next)).toBe(404);
  });

  it("returns 500 when the query fails", async () => {
    mockedDelete.mockRejectedValue(new Error("db down"));
    const { next } = await callHandler(deletePropertyHandler, { params: { id: "p1" } });
    expect(errorStatus(next)).toBe(500);
  });
});
