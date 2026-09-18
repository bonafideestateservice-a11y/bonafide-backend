import { NextFunction, Request, Response } from "express";
import { patchVerificationRequest } from "../../../../../api/client/verification/handlers/patch-verification-request";
import {
  findVerificationRequest,
  updateVerificationRequest,
} from "../../../../../api/client/verification/services/database/verification-request";
import { HttpStatusCode } from "../../../../../exceptions";
import { CustomRequest } from "../../../../../middlewares/check-jwt";

jest.mock(
  "../../../../../api/client/verification/services/database/verification-request",
);
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedFindVerificationRequest = findVerificationRequest as jest.Mock;
const mockedUpdateVerificationRequest = updateVerificationRequest as jest.Mock;

function buildMockReqRes(body: Record<string, unknown> = {}, userId?: string) {
  const req = {
    params: { id: "request-1" },
    body,
    user: userId ? { id: userId } : undefined,
  } as unknown as CustomRequest;
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  } as unknown as Response;
  const next = jest.fn() as NextFunction;
  return { req: req as Request, res, next };
}

describe("patchVerificationRequest handler (unit)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 401 when no authenticated user is present", async () => {
    const { req, res, next } = buildMockReqRes();

    await patchVerificationRequest(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.UNAUTHORIZED }),
    );
    expect(mockedFindVerificationRequest).not.toHaveBeenCalled();
  });

  it("returns 400 when no update fields are supplied", async () => {
    const { req, res, next } = buildMockReqRes({}, "user-1");

    await patchVerificationRequest(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.BAD_REQUEST }),
    );
    expect(mockedFindVerificationRequest).not.toHaveBeenCalled();
  });

  it("merges details and updates the additional note", async () => {
    mockedFindVerificationRequest.mockResolvedValue({
      id: "request-1",
      userId: "user-1",
      details: {
        propertyName: "Old Name",
        propertyType: "COMPLETED_BUILDING",
      },
      additionalNote: null,
    });
    mockedUpdateVerificationRequest.mockResolvedValue({
      id: "request-1",
      userId: "user-1",
      details: {
        propertyName: "New Name",
        propertyType: "COMPLETED_BUILDING",
        propertyAddress: "12 Admiralty Way",
      },
      additionalNote: " Updated note ",
      status: "DRAFT",
    });
    const { req, res, next } = buildMockReqRes(
      {
        details: {
          propertyName: " New Name ",
          propertyAddress: "12 Admiralty Way",
        },
        additionalNote: " Updated note ",
      },
      "user-1",
    );

    await patchVerificationRequest(req, res, next);

    expect(mockedUpdateVerificationRequest).toHaveBeenCalledWith(
      { id: "request-1" },
      {
        details: {
          propertyName: "New Name",
          propertyType: "COMPLETED_BUILDING",
          propertyAddress: "12 Admiralty Way",
        },
        additionalNote: "Updated note",
      },
    );
    expect(res.status).toHaveBeenCalledWith(HttpStatusCode.OK);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ id: "request-1" }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("returns forbidden when the request belongs to another user", async () => {
    mockedFindVerificationRequest.mockResolvedValue({
      id: "request-1",
      userId: "other-user",
      details: {},
    });
    const { req, res, next } = buildMockReqRes(
      { additionalNote: "Updated" },
      "user-1",
    );

    await patchVerificationRequest(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.FORBIDDEN }),
    );
    expect(mockedUpdateVerificationRequest).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid detail fields", async () => {
    const { req, res, next } = buildMockReqRes(
      { details: { propertyAddress: "" } },
      "user-1",
    );

    await patchVerificationRequest(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.BAD_REQUEST }),
    );
    expect(mockedFindVerificationRequest).not.toHaveBeenCalled();
  });

  it("passes database failures to the error handler", async () => {
    mockedFindVerificationRequest.mockRejectedValue(new Error("DB exploded"));
    const { req, res, next } = buildMockReqRes(
      { additionalNote: "Updated" },
      "user-1",
    );

    await patchVerificationRequest(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.INTERNAL_SERVER }),
    );
    expect(res.status).not.toHaveBeenCalled();
  });
});
