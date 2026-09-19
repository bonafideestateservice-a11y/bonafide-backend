import { NextFunction, Request, Response } from "express";
import { getAgentsReports } from "../../../../../api/admin/verification/get-agents-reports";
import { getAgentReports } from "../../../../../api/admin/verification/services/database/verification-report";
import { getVerificationAgentByUserId } from "../../../../../api/admin/authentication/services/database/agent";
import { HttpStatusCode } from "../../../../../exceptions";

jest.mock(
  "../../../../../api/admin/verification/services/database/verification-report",
);
jest.mock("../../../../../api/admin/authentication/services/database/agent");
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedGetAgentReports = getAgentReports as jest.Mock;
const mockedGetAgent = getVerificationAgentByUserId as jest.Mock;

function buildMockReqRes(query: Record<string, unknown> = {}) {
  const req = { user: { id: "user-1" }, query } as unknown as Request;
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  } as unknown as Response;
  const next = jest.fn() as NextFunction;
  return { req, res, next };
}

describe("getAgentsReports handler (unit)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetAgent.mockResolvedValue({ id: "agent-1" });
  });

  it("maps report cards and forwards filters", async () => {
    mockedGetAgentReports.mockResolvedValue([
      {
        id: "report-1",
        generatedAt: new Date("2026-01-24T16:00:00.000Z"),
        reviewStatus: "APPROVED",
        rating: 4,
        reportUrl: "https://example.com/report.pdf",
        verificationRequest: {
          details: { businessAddress: "Garki District, Abuja" },
          user: { fullName: "Client Williams" },
          verificationType: { name: "Business Verification" },
        },
      },
    ]);
    const { req, res, next } = buildMockReqRes({
      reviewStatus: "APPROVED",
      search: "Garki",
    });

    await getAgentsReports(req, res, next);

    expect(mockedGetAgentReports).toHaveBeenCalledWith("agent-1", {
      reviewStatus: "APPROVED",
      search: "Garki",
    });
    expect(res.status).toHaveBeenCalledWith(HttpStatusCode.OK);
    expect(res.json).toHaveBeenCalledWith([
      {
        id: "report-1",
        verificationType: { name: "Business Verification" },
        client: { firstName: "Client", lastName: "Williams" },
        district: "Garki District, Abuja",
        generatedAt: "2026-01-24T16:00:00.000Z",
        reviewStatus: "APPROVED",
        rating: 4,
        reportUrl: "https://example.com/report.pdf",
      },
    ]);
  });

  it("rejects invalid review status", async () => {
    const { req, res, next } = buildMockReqRes({ reviewStatus: "PENDING" });
    await getAgentsReports(req, res, next);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.BAD_REQUEST }),
    );
    expect(res.status).not.toHaveBeenCalled();
  });
});
