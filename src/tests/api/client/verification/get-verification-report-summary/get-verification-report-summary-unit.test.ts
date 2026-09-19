import { NextFunction, Request, Response } from "express";
import { getVerificationReportSummary } from "../../../../../api/client/verification/handlers/get-verification-report-summary";
import { countUnviewedVerificationReports } from "../../../../../api/client/verification/services/database/verification-report";
import { HttpStatusCode } from "../../../../../exceptions";
import { CustomRequest } from "../../../../../middlewares/check-jwt";

jest.mock("../../../../../api/client/verification/services/database/verification-report");
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedCountUnviewedVerificationReports = countUnviewedVerificationReports as jest.Mock;

function buildMockReqRes(userId?: string) {
  const req = {
    user: userId ? { id: userId } : undefined,
  } as unknown as CustomRequest;
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  } as unknown as Response;
  const next = jest.fn() as NextFunction;
  return { req: req as Request, res, next };
}

describe("getVerificationReportSummary handler (unit)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 401 when no authenticated user is present", async () => {
    const { req, res, next } = buildMockReqRes();

    await getVerificationReportSummary(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.UNAUTHORIZED }),
    );
  });

  it("returns the authenticated user's unviewed report count", async () => {
    mockedCountUnviewedVerificationReports.mockResolvedValue(3);
    const { req, res, next } = buildMockReqRes("user-1");

    await getVerificationReportSummary(req, res, next);

    expect(mockedCountUnviewedVerificationReports).toHaveBeenCalledWith("user-1");
    expect(res.status).toHaveBeenCalledWith(HttpStatusCode.OK);
    expect(res.json).toHaveBeenCalledWith({ unviewedReportsCount: 3 });
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next with 500 when the database service fails", async () => {
    mockedCountUnviewedVerificationReports.mockRejectedValue(new Error("DB exploded"));
    const { req, res, next } = buildMockReqRes("user-1");

    await getVerificationReportSummary(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.INTERNAL_SERVER }),
    );
  });
});
