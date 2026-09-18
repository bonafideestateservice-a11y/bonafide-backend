import { NextFunction, Request, Response } from "express";
import { patchVerificationRequestPlan } from "../../../../../api/client/verification/handlers/patch-verification-request-plan";
import { findVerificationPlan } from "../../../../../api/client/verification/services/database/verification-plan";
import {
  findVerificationRequest,
  updateVerificationRequest,
} from "../../../../../api/client/verification/services/database/verification-request";
import { HttpStatusCode } from "../../../../../exceptions";
import { CustomRequest } from "../../../../../middlewares/check-jwt";

jest.mock(
  "../../../../../api/client/verification/services/database/verification-plan",
);
jest.mock(
  "../../../../../api/client/verification/services/database/verification-request",
);
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedFindVerificationPlan = findVerificationPlan as jest.Mock;
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

describe("patchVerificationRequestPlan handler (unit)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 401 without authentication", async () => {
    const { req, res, next } = buildMockReqRes({
      verificationPlanId: "plan-1",
    });

    await patchVerificationRequestPlan(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.UNAUTHORIZED }),
    );
  });

  it("returns 400 when verificationPlanId is missing", async () => {
    const { req, res, next } = buildMockReqRes({}, "user-1");

    await patchVerificationRequestPlan(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.BAD_REQUEST }),
    );
    expect(mockedFindVerificationRequest).not.toHaveBeenCalled();
  });

  it("selects a compatible verification plan", async () => {
    mockedFindVerificationRequest.mockResolvedValue({
      id: "request-1",
      userId: "user-1",
      verificationTypeId: "type-1",
    });
    mockedFindVerificationPlan.mockResolvedValue({
      id: "plan-1",
      verificationTypeId: "type-1",
      frequency: "ONE_TIME",
      name: "One time verification",
      priceInCents: 4500,
      currency: "USD",
    });
    mockedUpdateVerificationRequest.mockResolvedValue({
      id: "request-1",
      status: "DRAFT",
      verificationPlanId: "plan-1",
    });
    const { req, res, next } = buildMockReqRes(
      { verificationPlanId: " plan-1 " },
      "user-1",
    );

    await patchVerificationRequestPlan(req, res, next);

    expect(mockedFindVerificationPlan).toHaveBeenCalledWith({ id: "plan-1" });
    expect(mockedUpdateVerificationRequest).toHaveBeenCalledWith(
      { id: "request-1" },
      { verificationPlanId: "plan-1" },
    );
    expect(res.status).toHaveBeenCalledWith(HttpStatusCode.OK);
    expect(res.json).toHaveBeenCalledWith({
      id: "request-1",
      status: "DRAFT",
      verificationPlanId: "plan-1",
      plan: {
        frequency: "ONE_TIME",
        name: "One time verification",
        priceInCents: 4500,
        currency: "USD",
      },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects a plan from another verification type", async () => {
    mockedFindVerificationRequest.mockResolvedValue({
      id: "request-1",
      userId: "user-1",
      verificationTypeId: "type-1",
    });
    mockedFindVerificationPlan.mockResolvedValue({
      id: "plan-1",
      verificationTypeId: "type-2",
    });
    const { req, res, next } = buildMockReqRes(
      { verificationPlanId: "plan-1" },
      "user-1",
    );

    await patchVerificationRequestPlan(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.BAD_REQUEST }),
    );
    expect(mockedUpdateVerificationRequest).not.toHaveBeenCalled();
  });

  it("returns internal error when a database service fails", async () => {
    mockedFindVerificationRequest.mockRejectedValue(new Error("DB exploded"));
    const { req, res, next } = buildMockReqRes(
      { verificationPlanId: "plan-1" },
      "user-1",
    );

    await patchVerificationRequestPlan(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.INTERNAL_SERVER }),
    );
    expect(res.status).not.toHaveBeenCalled();
  });
});
