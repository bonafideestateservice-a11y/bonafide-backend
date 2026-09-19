import { NextFunction, Request, Response } from "express";
import { getAgentAssignmentChecklist } from "../../../../../api/admin/verification/handlers/get-agent-assignment-checklist";
import { getAgentAssignmentChecklist as getChecklist } from "../../../../../api/admin/verification/services/database/agent-assignment";
import { getVerificationAgentByUserId } from "../../../../../api/admin/authentication/services/database/agent";
import { HttpStatusCode } from "../../../../../exceptions";

jest.mock("../../../../../api/admin/authentication/services/database/agent");
jest.mock("../../../../../api/admin/verification/services/database/agent-assignment");
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedGetAgent = getVerificationAgentByUserId as jest.Mock;
const mockedGetChecklist = getChecklist as jest.Mock;

function buildMockReqRes(userId?: string) {
  const req = {
    user: userId ? { id: userId } : undefined,
    params: { id: "assignment-1" },
  } as unknown as Request;
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  } as unknown as Response;
  const next = jest.fn() as NextFunction;
  return { req, res, next };
}

describe("getAgentAssignmentChecklist handler (unit)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns the checklist, client documents, client, notes, progress, and payment", async () => {
    const response = {
      checklistItems: [],
      clientDocuments: [],
      client: {
        firstName: "Client",
        lastName: "User",
        phone: "08000000000",
        email: "client@example.com",
      },
      additionalNotes: null,
      progressPercent: 0,
      payment: { status: "SUCCESS", amountInCents: 3500000 },
    };
    mockedGetAgent.mockResolvedValue({ id: "agent-1" });
    mockedGetChecklist.mockResolvedValue(response);
    const { req, res, next } = buildMockReqRes("user-1");

    await getAgentAssignmentChecklist(req, res, next);

    expect(mockedGetAgent).toHaveBeenCalledWith("user-1");
    expect(mockedGetChecklist).toHaveBeenCalledWith("agent-1", "assignment-1");
    expect(res.status).toHaveBeenCalledWith(HttpStatusCode.OK);
    expect(res.json).toHaveBeenCalledWith(response);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when the agent is not authenticated", async () => {
    const { req, res, next } = buildMockReqRes();

    await getAgentAssignmentChecklist(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.UNAUTHORIZED }),
    );
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns 404 when the assignment is not owned by the agent", async () => {
    mockedGetAgent.mockResolvedValue({ id: "agent-1" });
    mockedGetChecklist.mockResolvedValue(null);
    const { req, res, next } = buildMockReqRes("user-1");

    await getAgentAssignmentChecklist(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.NOT_FOUND }),
    );
    expect(res.status).not.toHaveBeenCalled();
  });
});
