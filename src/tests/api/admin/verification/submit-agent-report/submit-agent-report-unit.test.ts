import { NextFunction, Request, Response } from "express";
import { submitAgentReport } from "../../../../../api/admin/verification/handlers/submit-agent-report";
import { getVerificationAgentByUserId } from "../../../../../api/admin/authentication/services/database/agent";
import { submitAgentAssignmentReport } from "../../../../../api/admin/verification/services/database/verification-report";
import { HttpStatusCode } from "../../../../../exceptions";

jest.mock("../../../../../api/admin/authentication/services/database/agent");
jest.mock("../../../../../api/admin/verification/services/database/verification-report");
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedGetAgent = getVerificationAgentByUserId as jest.Mock;
const mockedSubmit = submitAgentAssignmentReport as jest.Mock;

function buildMockReqRes(userId?: string) {
  const req = {
    user: userId ? { id: userId } : undefined,
    params: { id: "assignment-1" },
  } as unknown as Request;
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response;
  const next = jest.fn() as NextFunction;
  return { req, res, next };
}

describe("submitAgentReport handler (unit)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 409 with remaining checklist items", async () => {
    mockedGetAgent.mockResolvedValue({ id: "agent-1" });
    mockedSubmit.mockResolvedValue({
      kind: "INCOMPLETE_CHECKLIST",
      progressPercent: 50,
      remainingItems: ["Survey plan"],
    });
    const { req, res, next } = buildMockReqRes("user-1");

    await submitAgentReport(req, res, next);

    expect(res.status).toHaveBeenCalledWith(HttpStatusCode.CONFLICT);
    expect(res.json).toHaveBeenCalledWith({
      error: "INCOMPLETE_CHECKLIST",
      progressPercent: 50,
      remainingItems: ["Survey plan"],
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 201 with the submitted report", async () => {
    mockedGetAgent.mockResolvedValue({ id: "agent-1" });
    mockedSubmit.mockResolvedValue({
      kind: "SUBMITTED",
      id: "report-1",
      reviewStatus: "PENDING",
      generatedAt: new Date("2026-09-19T18:00:00.000Z"),
    });
    const { req, res, next } = buildMockReqRes("user-1");

    await submitAgentReport(req, res, next);

    expect(mockedSubmit).toHaveBeenCalledWith("agent-1", "assignment-1");
    expect(res.status).toHaveBeenCalledWith(HttpStatusCode.CREATED);
    expect(res.json).toHaveBeenCalledWith({
      id: "report-1",
      reviewStatus: "PENDING",
      generatedAt: "2026-09-19T18:00:00.000Z",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 without authentication", async () => {
    const { req, res, next } = buildMockReqRes();

    await submitAgentReport(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.UNAUTHORIZED }),
    );
  });
});
