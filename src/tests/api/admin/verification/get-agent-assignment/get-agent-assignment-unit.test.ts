import { NextFunction, Request, Response } from "express";
import { getAgentAssignment } from "../../../../../api/admin/verification/get-agent-assignment";
import { getAgentAssignmentById } from "../../../../../api/admin/verification/services/database/agent-assignment";
import { getVerificationAgentByUserId } from "../../../../../api/admin/authentication/services/database/agent";
import { HttpStatusCode } from "../../../../../exceptions";

jest.mock("../../../../../api/admin/verification/services/database/agent-assignment");
jest.mock("../../../../../api/admin/authentication/services/database/agent");
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedGetAssignment = getAgentAssignmentById as jest.Mock;
const mockedGetAgent = getVerificationAgentByUserId as jest.Mock;

function buildMockReqRes() {
  const req = { user: { id: "user-1" }, params: { id: "assignment-1" } } as unknown as Request;
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response;
  const next = jest.fn() as NextFunction;
  return { req, res, next };
}

describe("getAgentAssignment handler (unit)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetAgent.mockResolvedValue({ id: "agent-1" });
  });

  it("returns the assignment, client, address, and payment summary", async () => {
    mockedGetAssignment.mockResolvedValue({
      id: "assignment-1",
      status: "ASSIGNED",
      scheduledAt: new Date("2026-01-24T16:00:00.000Z"),
      verificationRequest: {
        details: { propertyAddress: "Plot 45, Lekki Phase 1, Lagos" },
        verificationType: { name: "Property Verification" },
        user: { fullName: "Client David", phone: "08012345678", email: "david@example.com" },
        transaction: { status: "SUCCESS", amountInCents: 3500000, currency: "NGN" },
      },
    });
    const { req, res, next } = buildMockReqRes();

    await getAgentAssignment(req, res, next);

    expect(mockedGetAssignment).toHaveBeenCalledWith("agent-1", "assignment-1");
    expect(res.status).toHaveBeenCalledWith(HttpStatusCode.OK);
    expect(res.json).toHaveBeenCalledWith({
      id: "assignment-1",
      status: "ASSIGNED",
      verificationType: { name: "Property Verification" },
      address: "Plot 45, Lekki Phase 1, Lagos",
      client: {
        firstName: "Client",
        lastName: "David",
        phone: "08012345678",
        email: "david@example.com",
      },
      payment: { status: "SUCCESS", amountInCents: 3500000, currency: "NGN" },
      scheduledAt: "2026-01-24T16:00:00.000Z",
    });
  });

  it("returns 404 when the assignment is not owned by the agent", async () => {
    mockedGetAssignment.mockResolvedValue(null);
    const { req, res, next } = buildMockReqRes();
    await getAgentAssignment(req, res, next);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.NOT_FOUND }),
    );
    expect(res.status).not.toHaveBeenCalled();
  });
});
