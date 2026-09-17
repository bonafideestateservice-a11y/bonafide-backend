import { NextFunction, Request, Response } from "express";
import { getVerificationRequests } from "../../../../../api/client/verification/handlers/get-verification-requests";
import { getVerificationRequestsForUser } from "../../../../../api/client/verification/services/database/verification-request";
import { HttpStatusCode } from "../../../../../exceptions";
import { CustomRequest } from "../../../../../middlewares/check-jwt";

jest.mock(
  "../../../../../api/client/verification/services/database/verification-request",
);
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedGetVerificationRequestsForUser =
  getVerificationRequestsForUser as jest.Mock;

function buildMockReqRes(query: Record<string, unknown> = {}, userId?: string) {
  const req = {
    query,
    user: userId ? { id: userId } : undefined,
  } as unknown as CustomRequest;
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  } as unknown as Response;
  const next = jest.fn() as NextFunction;
  return { req: req as Request, res, next };
}

describe("getVerificationRequests handler (unit)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 401 when no authenticated user is present", async () => {
    const { req, res, next } = buildMockReqRes();

    await getVerificationRequests(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.UNAUTHORIZED }),
    );
  });

  it("returns 400 when limit is outside the allowed range", async () => {
    const { req, res, next } = buildMockReqRes({ limit: "51" }, "user-1");

    await getVerificationRequests(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.BAD_REQUEST }),
    );
    expect(mockedGetVerificationRequestsForUser).not.toHaveBeenCalled();
  });

  it("returns mapped verification request summaries", async () => {
    mockedGetVerificationRequestsForUser.mockResolvedValue([
      {
        id: "request-1",
        details: { propertyName: "Lekki Phase 1 Apartment" },
        status: "IN_PROGRESS",
        updatedAt: new Date("2026-09-17T10:00:00.000Z"),
        verificationType: { name: "Verification", icon: "building" },
      },
    ]);
    const { req, res, next } = buildMockReqRes({ limit: "2" }, "user-1");

    await getVerificationRequests(req, res, next);

    expect(mockedGetVerificationRequestsForUser).toHaveBeenCalledWith(
      "user-1",
      2,
    );
    expect(res.status).toHaveBeenCalledWith(HttpStatusCode.OK);
    expect(res.json).toHaveBeenCalledWith([
      {
        id: "request-1",
        title: "Lekki Phase 1 Apartment",
        verificationType: { name: "Verification", icon: "building" },
        status: "IN_PROGRESS",
        updatedAt: "2026-09-17T10:00:00.000Z",
      },
    ]);
    expect(next).not.toHaveBeenCalled();
  });

  it("uses a fallback title when propertyName is missing", async () => {
    mockedGetVerificationRequestsForUser.mockResolvedValue([
      {
        id: "request-1",
        details: {},
        status: "COMPLETED",
        updatedAt: new Date("2026-09-17T10:00:00.000Z"),
        verificationType: { name: "Verification", icon: null },
      },
    ]);
    const { req, res, next } = buildMockReqRes({}, "user-1");

    await getVerificationRequests(req, res, next);

    expect(res.json).toHaveBeenCalledWith([
      expect.objectContaining({ title: "Verification request" }),
    ]);
  });

  it("calls next with 500 when the database service fails", async () => {
    mockedGetVerificationRequestsForUser.mockRejectedValue(
      new Error("DB exploded"),
    );
    const { req, res, next } = buildMockReqRes({}, "user-1");

    await getVerificationRequests(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.INTERNAL_SERVER }),
    );
  });
});
