import { NextFunction, Request, Response } from "express";
import { startVerification } from "../../../../../api/admin/verification/handlers/start-verification";
import { getVerificationAgentByUserId } from "../../../../../api/admin/authentication/services/database/agent";
import { startAgentAssignment } from "../../../../../api/admin/verification/services/database/agent-assignment";
import { HttpStatusCode } from "../../../../../exceptions";

jest.mock("../../../../../api/admin/authentication/services/database/agent");
jest.mock("../../../../../api/admin/verification/services/database/agent-assignment");
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedGetAgent = getVerificationAgentByUserId as jest.Mock;
const mockedStartAssignment = startAgentAssignment as jest.Mock;

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

describe("startVerification handler (unit)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns the accepted assignment and initialized checklist", async () => {
    mockedGetAgent.mockResolvedValue({ id: "agent-1" });
    mockedStartAssignment.mockResolvedValue({
      id: "assignment-1",
      status: "ACCEPTED",
      checklist: [
        {
          id: "item-1",
          label: "Property structure verified",
          status: "PENDING",
          requiresMedia: true,
        },
      ],
    });
    const { req, res, next } = buildMockReqRes("user-1");

    await startVerification(req, res, next);

    expect(mockedGetAgent).toHaveBeenCalledWith("user-1");
    expect(mockedStartAssignment).toHaveBeenCalledWith("agent-1", "assignment-1");
    expect(res.status).toHaveBeenCalledWith(HttpStatusCode.OK);
    expect(res.json).toHaveBeenCalledWith({
      id: "assignment-1",
      status: "ACCEPTED",
      checklist: [
        {
          id: "item-1",
          label: "Property structure verified",
          status: "PENDING",
          requiresMedia: true,
        },
      ],
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when the agent is not authenticated", async () => {
    const { req, res, next } = buildMockReqRes();

    await startVerification(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.UNAUTHORIZED }),
    );
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns 404 when the user has no verification agent", async () => {
    mockedGetAgent.mockResolvedValue(null);
    const { req, res, next } = buildMockReqRes("user-1");

    await startVerification(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.NOT_FOUND }),
    );
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns 404 when the assignment is not owned by the agent", async () => {
    mockedGetAgent.mockResolvedValue({ id: "agent-1" });
    mockedStartAssignment.mockResolvedValue(null);
    const { req, res, next } = buildMockReqRes("user-1");

    await startVerification(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.NOT_FOUND }),
    );
    expect(res.status).not.toHaveBeenCalled();
  });
});
