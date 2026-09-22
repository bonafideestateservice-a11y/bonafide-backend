import { NextFunction, Request, Response } from "express";
import publishProperty from "../../../../../api/admin/dashboard/handlers/publish-property";
import { publishProperty as publishPropertyFromDatabase } from "../../../../../api/admin/dashboard/services/database/property";
import { HttpStatusCode, NotFoundError } from "../../../../../exceptions";

jest.mock("../../../../../api/admin/dashboard/services/database/property");
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedPublishProperty = publishPropertyFromDatabase as jest.Mock;

function buildMockReqRes() {
  const req = { params: { id: "property-1" } } as unknown as Request;
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response;
  const next = jest.fn() as NextFunction;
  return { req, res, next };
}

describe("publishProperty handler (unit)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("toggles and returns the property's publication state", async () => {
    mockedPublishProperty.mockResolvedValue({
      id: "property-1",
      isPublished: true,
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    const { req, res, next } = buildMockReqRes();

    await publishProperty(req, res, next);

    expect(mockedPublishProperty).toHaveBeenCalledWith("property-1");
    expect(res.status).toHaveBeenCalledWith(HttpStatusCode.OK);
    expect(res.json).toHaveBeenCalledWith({
      id: "property-1",
      isPublished: true,
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("maps missing properties to not found", async () => {
    mockedPublishProperty.mockRejectedValue(
      Object.assign(new Error("Property not found"), { code: "P2025" }),
    );
    const { req, res, next } = buildMockReqRes();

    await publishProperty(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
    expect(res.status).not.toHaveBeenCalled();
  });
});
