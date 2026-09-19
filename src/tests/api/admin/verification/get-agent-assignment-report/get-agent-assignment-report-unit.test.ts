import { NextFunction, Request, Response } from "express";
import { getAgentAssignmentReportHandler } from "../../../../../api/admin/verification/handlers/get-agent-assignment-report";
import { getVerificationAgentByUserId } from "../../../../../api/admin/authentication/services/database/agent";
import { getAgentAssignmentReport } from "../../../../../api/admin/verification/services/database/verification-report";
import { HttpStatusCode } from "../../../../../exceptions";

jest.mock("../../../../../api/admin/authentication/services/database/agent");
jest.mock("../../../../../api/admin/verification/services/database/verification-report");
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedGetAgent = getVerificationAgentByUserId as jest.Mock;
const mockedGetReport = getAgentAssignmentReport as jest.Mock;

function buildMockReqRes(userId?: string) {
  const req = {
    user: userId ? { id: userId } : undefined,
    params: { id: "assignment-1" },
  } as unknown as Request;
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response;
  const next = jest.fn() as NextFunction;
  return { req, res, next };
}

describe("getAgentAssignmentReportHandler (unit)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns the assignment report", async () => {
    const report = {
      client: {
        firstName: "Client",
        lastName: "User",
        phone: "08000000000",
        email: "client@example.com",
      },
      address: "Plot 45, Lagos",
      photos: [{ url: "https://cdn.test/front.jpg", label: "Front View" }],
      additionalNotes: "All good.",
      reportUrl: null,
    };
    mockedGetAgent.mockResolvedValue({ id: "agent-1" });
    mockedGetReport.mockResolvedValue(report);
    const { req, res, next } = buildMockReqRes("user-1");

    await getAgentAssignmentReportHandler(req, res, next);

    expect(mockedGetReport).toHaveBeenCalledWith("agent-1", "assignment-1");
    expect(res.status).toHaveBeenCalledWith(HttpStatusCode.OK);
    expect(res.json).toHaveBeenCalledWith(report);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 404 when no report exists for the assignment", async () => {
    mockedGetAgent.mockResolvedValue({ id: "agent-1" });
    mockedGetReport.mockResolvedValue(null);
    const { req, res, next } = buildMockReqRes("user-1");

    await getAgentAssignmentReportHandler(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.NOT_FOUND }),
    );
    expect(res.status).not.toHaveBeenCalled();
  });
});
