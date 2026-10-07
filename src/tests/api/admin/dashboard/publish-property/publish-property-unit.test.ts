import { publishPropertyHandler } from "../../../../../api/admin/dashboard/handlers/publish-property";
import { publishProperty } from "../../../../../api/admin/dashboard/services/database/property";
import { callHandler, errorStatus } from "../../../../helpers/http";

jest.mock("../../../../../api/admin/dashboard/services/database/property");
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedPublish = publishProperty as jest.Mock;

describe("publishPropertyHandler (unit)", () => {
  beforeEach(() => jest.clearAllMocks());

  it.each([true, false])("sets isPublished to %s", async (isPublished) => {
    mockedPublish.mockResolvedValue({
      id: "p1",
      isPublished,
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    const { res } = await callHandler(publishPropertyHandler, {
      params: { id: "p1" },
      body: { isPublished },
    });

    expect(mockedPublish).toHaveBeenCalledWith("p1", isPublished);
    expect(res.json).toHaveBeenCalledWith({
      id: "p1",
      isPublished,
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it.each([[{}], [{ isPublished: "true" }]])("returns 400 for body %j", async (body) => {
    const { next } = await callHandler(publishPropertyHandler, { params: { id: "p1" }, body });
    expect(errorStatus(next)).toBe(400);
    expect(mockedPublish).not.toHaveBeenCalled();
  });

  it("returns 404 for missing or deleted properties", async () => {
    mockedPublish.mockRejectedValue(Object.assign(new Error("not found"), { code: "P2025" }));
    const { next } = await callHandler(publishPropertyHandler, {
      params: { id: "p1" },
      body: { isPublished: true },
    });
    expect(errorStatus(next)).toBe(404);
  });
});
