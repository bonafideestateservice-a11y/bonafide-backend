import { NextFunction, Request, Response } from "express";
import { getVerificationTypes } from "../../../../../api/client/verification/handlers/get-verification-types";
import { getVerificationTypesForService } from "../../../../../api/client/verification/services/database/verification-type";
import { HttpStatusCode } from "../../../../../exceptions";

jest.mock(
  "../../../../../api/client/verification/services/database/verification-type",
);
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedGetVerificationTypesForService =
  getVerificationTypesForService as jest.Mock;

function buildMockRes() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  } as unknown as Response;
  const next = jest.fn() as NextFunction;
  return { res, next };
}

describe("getVerificationTypes handler (unit)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns verification category cards for the verification service", async () => {
    mockedGetVerificationTypesForService.mockResolvedValue([
      {
        id: "type-1",
        name: "Property Verification",
        slug: "property-verification",
        description: "Verify property ownership.",
        icon: "property",
      },
    ]);
    const { res, next } = buildMockRes();

    await getVerificationTypes({} as Request, res, next);

    expect(mockedGetVerificationTypesForService).toHaveBeenCalledWith(
      "verification",
    );
    expect(res.status).toHaveBeenCalledWith(HttpStatusCode.OK);
    expect(res.json).toHaveBeenCalledWith([
      {
        id: "type-1",
        name: "Property Verification",
        slug: "property-verification",
        description: "Verify property ownership.",
        icon: "property",
      },
    ]);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns an empty description when the database description is null", async () => {
    mockedGetVerificationTypesForService.mockResolvedValue([
      {
        id: "type-1",
        name: "Business Verification",
        slug: "business-verification",
        description: null,
        icon: null,
      },
    ]);
    const { res, next } = buildMockRes();

    await getVerificationTypes({} as Request, res, next);

    expect(res.json).toHaveBeenCalledWith([
      expect.objectContaining({ description: "", icon: null }),
    ]);
  });

  it("passes database errors to the error handler", async () => {
    mockedGetVerificationTypesForService.mockRejectedValue(
      new Error("DB exploded"),
    );
    const { res, next } = buildMockRes();

    await getVerificationTypes({} as Request, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.INTERNAL_SERVER }),
    );
    expect(res.status).not.toHaveBeenCalled();
  });
});
