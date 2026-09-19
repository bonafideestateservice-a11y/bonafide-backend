import { NextFunction, Request, Response } from "express";
import { getAgentsAssignments } from "../../../../../api/admin/verification/handlers/get-agents-assignments";
import { getAgentAssignmentsById } from "../../../../../api/admin/verification/services/database/agent-assignment";
import { getVerificationAgentByUserId } from "../../../../../api/admin/authentication/services/database/agent";
import { HttpStatusCode } from "../../../../../exceptions";

jest.mock("../../../../../api/admin/verification/services/database/agent-assignment");
jest.mock("../../../../../api/admin/authentication/services/database/agent");
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedGetAgentAssignmentsById = getAgentAssignmentsById as jest.Mock;
const mockedGetVerificationAgentByUserId = getVerificationAgentByUserId as jest.Mock;

function buildMockReqRes() {
  const req = {
    user: { id: "user-1" },
    query: { limit: "5", status: "ALL", search: "" },
  } as unknown as Request;
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  } as unknown as Response;
  const next = jest.fn() as NextFunction;
  return { req, res, next };
}

describe("getAgentsAssignments handler (unit)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns assignments with serialized dates", async () => {
    mockedGetVerificationAgentByUserId.mockResolvedValue({ id: "agent-1" });
    mockedGetAgentAssignmentsById.mockResolvedValue([
      {
        id: "assignment-1",
        status: "ASSIGNED",
        progressPercent: 60,
        additionalNotes: "Call client before inspection.",
        scheduledAt: new Date("2026-09-20T10:00:00.000Z"),
        completedAt: null,
        agent: { id: "agent-1", name: "Jane Agent", region: "Lagos" },
        verificationRequest: {
          id: "request-1",
          status: "IN_PROGRESS",
          details: { propertyAddress: "Lagos" },
          user: { fullName: "Client David" },
          verificationType: { name: "Property" },
        },
        checklistItems: [],
      },
    ]);
    const { req, res, next } = buildMockReqRes();

    await getAgentsAssignments(req, res, next);

    expect(res.status).toHaveBeenCalledWith(HttpStatusCode.OK);
    expect(res.json).toHaveBeenCalledWith([
      {
        id: "assignment-1",
        verificationType: { name: "Property" },
        client: { firstName: "Client", lastName: "David" },
        address: "Lagos",
        status: "ASSIGNED",
        progressPercent: 60,
        scheduledAt: "2026-09-20T10:00:00.000Z",
      },
    ]);
    expect(mockedGetAgentAssignmentsById).toHaveBeenCalledWith("agent-1", {
      limit: 5,
      status: "ALL",
      search: "",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("passes status and search filters to the database service", async () => {
    mockedGetVerificationAgentByUserId.mockResolvedValue({ id: "agent-1" });
    mockedGetAgentAssignmentsById.mockResolvedValue([]);
    const { req, res, next } = buildMockReqRes();
    req.query = { limit: "10", status: "IN_PROGRESS", search: "David" };

    await getAgentsAssignments(req, res, next);

    expect(mockedGetAgentAssignmentsById).toHaveBeenCalledWith("agent-1", {
      limit: 10,
      status: "IN_PROGRESS",
      search: "David",
    });
    expect(res.status).toHaveBeenCalledWith(HttpStatusCode.OK);
    expect(next).not.toHaveBeenCalled();
  });

  it("forwards database errors", async () => {
    mockedGetVerificationAgentByUserId.mockResolvedValue({ id: "agent-1" });
    mockedGetAgentAssignmentsById.mockRejectedValue(new Error("DB exploded"));
    const { req, res, next } = buildMockReqRes();
    await getAgentsAssignments(req, res, next);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.INTERNAL_SERVER }),
    );
  });
});
