import { NextFunction, Request, Response } from "express";
import { assignVerificationRequestAgent } from "../../../../../api/admin/verification/handlers/assign-verification-request-agent";
import { assignAgentToVerificationRequest } from "../../../../../api/admin/verification/services/database/agent-assignment";
import { HttpStatusCode } from "../../../../../exceptions";

jest.mock("../../../../../api/admin/verification/services/database/agent-assignment");
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedAssign = assignAgentToVerificationRequest as jest.Mock;

function buildMockReqRes(body: unknown = { agentId: "agent-1" }) {
  const req = {
    user: { id: "admin-1", role: "ADMIN" },
    params: { id: "request-1" },
    body,
  } as unknown as Request;
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  } as unknown as Response;
  const next = jest.fn() as NextFunction;
  return { req, res, next };
}

describe("assignVerificationRequestAgent handler (unit)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("assigns the agent and returns the new assignment", async () => {
    const createdAt = new Date("2026-10-06T09:00:00.000Z");
    mockedAssign.mockResolvedValue({
      kind: "ASSIGNED",
      assignment: {
        id: "assignment-1",
        status: "ASSIGNED",
        createdAt,
        agent: { id: "agent-1", name: "Tunde Bello" },
      },
    });
    const { req, res, next } = buildMockReqRes({ agentId: "  agent-1  " });

    await assignVerificationRequestAgent(req, res, next);

    expect(mockedAssign).toHaveBeenCalledWith("request-1", "agent-1");
    expect(res.status).toHaveBeenCalledWith(HttpStatusCode.CREATED);
    expect(res.json).toHaveBeenCalledWith({
      id: "assignment-1",
      verificationRequestId: "request-1",
      status: "ASSIGNED",
      agent: { id: "agent-1", name: "Tunde Bello" },
      createdAt: "2026-10-06T09:00:00.000Z",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it.each([[{}], [{ agentId: "" }], [{ agentId: "   " }], [{ agentId: 42 }], [null]])(
    "returns 400 when agentId is invalid (body: %j)",
    async (body) => {
      const { req, res, next } = buildMockReqRes(body);

      await assignVerificationRequestAgent(req, res, next);

      expect(mockedAssign).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: HttpStatusCode.BAD_REQUEST }),
      );
    },
  );

  it.each([
    [{ kind: "REQUEST_NOT_FOUND" }, HttpStatusCode.NOT_FOUND, "Verification request not found."],
    [{ kind: "AGENT_NOT_FOUND" }, HttpStatusCode.NOT_FOUND, "Verification agent not found."],
    [{ kind: "AGENT_INACTIVE" }, HttpStatusCode.BAD_REQUEST, "Verification agent is inactive."],
    [
      { kind: "ALREADY_ASSIGNED", agentId: "agent-2" },
      HttpStatusCode.CONFLICT,
      "Verification request already has an assigned agent.",
    ],
    [
      { kind: "NO_PAID_PERIOD" },
      HttpStatusCode.CONFLICT,
      "Verification request has no paid period awaiting an agent.",
    ],
    [
      { kind: "REQUEST_NOT_ASSIGNABLE", status: "PENDING_PAYMENT" },
      HttpStatusCode.CONFLICT,
      "Only paid verification requests awaiting an agent can be assigned (current status: PENDING_PAYMENT).",
    ],
  ])("maps %j to status %s", async (result, statusCode, message) => {
    mockedAssign.mockResolvedValue(result);
    const { req, res, next } = buildMockReqRes();

    await assignVerificationRequestAgent(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode, message }));
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns 500 when the service throws", async () => {
    mockedAssign.mockRejectedValue(new Error("database unavailable"));
    const { req, res, next } = buildMockReqRes();

    await assignVerificationRequestAgent(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.INTERNAL_SERVER }),
    );
  });
});
