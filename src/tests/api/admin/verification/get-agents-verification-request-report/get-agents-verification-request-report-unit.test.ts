import { NextFunction, Request, Response } from "express";
import { getAgentsVerificationRequestReport } from "../../../../../api/admin/verification/get-agents-verification-request-report";
import { getAgentVerificationRequestReport } from "../../../../../api/admin/verification/services/database/verification-report";
import { getVerificationAgentByUserId } from "../../../../../api/admin/authentication/services/database/agent";
import { HttpStatusCode } from "../../../../../exceptions";

jest.mock(
  "../../../../../api/admin/verification/services/database/verification-report",
);
jest.mock("../../../../../api/admin/authentication/services/database/agent");
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedGetReport = getAgentVerificationRequestReport as jest.Mock;
const mockedGetAgent = getVerificationAgentByUserId as jest.Mock;

function buildMockReqRes() {
  const req = {
    user: { id: "user-1" },
    params: { id: "request-1" },
  } as unknown as Request;
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  } as unknown as Response;
  const next = jest.fn() as NextFunction;
  return { req, res, next };
}

describe("getAgentsVerificationRequestReport handler (unit)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetAgent.mockResolvedValue({ id: "agent-1" });
  });

  it("returns the full report", async () => {
    const report = {
      id: "report-1",
      reviewStatus: "APPROVED",
      reportUrl: "https://example.com/report.pdf",
    };
    mockedGetReport.mockResolvedValue(report);
    const { req, res, next } = buildMockReqRes();

    await getAgentsVerificationRequestReport(req, res, next);

    expect(mockedGetReport).toHaveBeenCalledWith("agent-1", "request-1");
    expect(res.status).toHaveBeenCalledWith(HttpStatusCode.OK);
    expect(res.json).toHaveBeenCalledWith(report);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 404 when the report is not found", async () => {
    mockedGetReport.mockResolvedValue(null);
    const { req, res, next } = buildMockReqRes();
    await getAgentsVerificationRequestReport(req, res, next);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.NOT_FOUND }),
    );
  });
});
