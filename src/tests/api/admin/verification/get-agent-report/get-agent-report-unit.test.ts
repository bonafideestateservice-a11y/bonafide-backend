import { NextFunction, Request, Response } from "express";
import { getAgentReport } from "../../../../../api/admin/verification/handlers/get-agent-report";
import { getVerificationAgentByUserId } from "../../../../../api/admin/authentication/services/database/agent";
import { getAgentReportById } from "../../../../../api/admin/verification/services/database/verification-report";
import { HttpStatusCode } from "../../../../../exceptions";

jest.mock("../../../../../api/admin/authentication/services/database/agent");
jest.mock("../../../../../api/admin/verification/services/database/verification-report");
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedGetAgent = getVerificationAgentByUserId as jest.Mock;
const mockedGetReport = getAgentReportById as jest.Mock;

const buildReqRes = (userId?: string) => {
  const req = {
    user: userId ? { id: userId } : undefined,
    params: { id: "report-1" },
  } as unknown as Request;
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  } as unknown as Response;
  return { req, res, next: jest.fn() as NextFunction };
};

describe("getAgentReport handler (unit)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetAgent.mockResolvedValue({ id: "agent-1" });
  });

  it("returns the agent's report by report ID", async () => {
    const view = {
      client: { firstName: "Ada", lastName: "Okafor", phone: "", email: "ada@example.com" },
      address: "Plot 7, Abuja",
      photos: [{ url: "https://cdn.test/perimeter.jpg", label: "Perimeter" }],
      additionalNotes: "Notes",
      reportUrl: null,
    };
    mockedGetReport.mockResolvedValue({
      id: "report-1",
      verificationRequestId: "request-1",
      generatedAt: new Date("2026-10-05T10:00:00Z"),
      reviewStatus: "PENDING",
      ...view,
    });
    const { req, res, next } = buildReqRes("user-1");

    await getAgentReport(req, res, next);

    expect(mockedGetAgent).toHaveBeenCalledWith("user-1");
    expect(mockedGetReport).toHaveBeenCalledWith("agent-1", "report-1");
    expect(res.status).toHaveBeenCalledWith(HttpStatusCode.OK);
    expect(res.json).toHaveBeenCalledWith({
      id: "report-1",
      verificationRequestId: "request-1",
      generatedAt: "2026-10-05T10:00:00.000Z",
      reviewStatus: "PENDING",
      ...view,
    });
  });

  it("returns 404 when the report doesn't exist or belongs to another agent", async () => {
    mockedGetReport.mockResolvedValue(null);
    const { req, res, next } = buildReqRes("user-1");

    await getAgentReport(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatusCode.NOT_FOUND,
        message: "Report not found.",
      }),
    );
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns 404 when the user isn't a verification agent", async () => {
    mockedGetAgent.mockResolvedValue(null);
    const { req, res, next } = buildReqRes("user-1");

    await getAgentReport(req, res, next);

    expect(mockedGetReport).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.NOT_FOUND }),
    );
  });

  it("returns 401 without an authenticated user", async () => {
    const { req, res, next } = buildReqRes();

    await getAgentReport(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.UNAUTHORIZED }),
    );
  });

  it("returns 500 when the lookup fails", async () => {
    mockedGetReport.mockRejectedValue(new Error("database down"));
    const { req, res, next } = buildReqRes("user-1");

    await getAgentReport(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.INTERNAL_SERVER }),
    );
  });
});
