import { NextFunction, Request, Response } from "express";
import { getVerificationRequest } from "../../../../../api/client/verification/handlers/get-verification-request";
import { getVerificationRequestDetailsForUser } from "../../../../../api/client/verification/services/database/verification-request";
import { HttpStatusCode } from "../../../../../exceptions";
import { CustomRequest } from "../../../../../middlewares/check-jwt";

jest.mock("../../../../../api/client/verification/services/database/verification-request");
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedGetVerificationRequestDetailsForUser =
  getVerificationRequestDetailsForUser as jest.Mock;

function buildMockReqRes(userId?: string) {
  const req = {
    params: { id: "request-1" },
    user: userId ? { id: userId } : undefined,
  } as unknown as CustomRequest;
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  } as unknown as Response;
  const next = jest.fn() as NextFunction;
  return { req: req as Request, res, next };
}

describe("getVerificationRequest handler (unit)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 401 without authentication", async () => {
    const { req, res, next } = buildMockReqRes();

    await getVerificationRequest(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.UNAUTHORIZED }),
    );
    expect(mockedGetVerificationRequestDetailsForUser).not.toHaveBeenCalled();
  });

  it("returns the request summary with its selected plan", async () => {
    mockedGetVerificationRequestDetailsForUser.mockResolvedValue({
      id: "request-1",
      status: "DRAFT",
      details: { propertyAddress: "12 Admiralty Way" },
      createdAt: new Date("2026-09-18T10:00:00.000Z"),
      verificationType: { name: "Property Verification" },
      verificationPlan: {
        frequency: "ONE_TIME",
        name: "One time verification",
        priceInCents: 4500,
        currency: "USD",
      },
    });
    const { req, res, next } = buildMockReqRes("user-1");

    await getVerificationRequest(req, res, next);

    expect(mockedGetVerificationRequestDetailsForUser).toHaveBeenCalledWith("request-1", "user-1");
    expect(res.status).toHaveBeenCalledWith(HttpStatusCode.OK);
    expect(res.json).toHaveBeenCalledWith({
      id: "request-1",
      status: "DRAFT",
      verificationType: { name: "Property Verification" },
      details: { propertyAddress: "12 Admiralty Way" },
      plan: {
        frequency: "ONE_TIME",
        name: "One time verification",
        priceInCents: 4500,
        currency: "USD",
      },
      createdAt: "2026-09-18T10:00:00.000Z",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 404 when the request has no selected plan", async () => {
    mockedGetVerificationRequestDetailsForUser.mockResolvedValue({
      id: "request-1",
      status: "DRAFT",
      details: {},
      createdAt: new Date(),
      verificationType: { name: "Property Verification" },
      verificationPlan: null,
    });
    const { req, res, next } = buildMockReqRes("user-1");

    await getVerificationRequest(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.NOT_FOUND }),
    );
    expect(res.status).not.toHaveBeenCalled();
  });

  it("passes database failures to the error handler", async () => {
    mockedGetVerificationRequestDetailsForUser.mockRejectedValue(new Error("DB exploded"));
    const { req, res, next } = buildMockReqRes("user-1");

    await getVerificationRequest(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.INTERNAL_SERVER }),
    );
    expect(res.status).not.toHaveBeenCalled();
  });
});
