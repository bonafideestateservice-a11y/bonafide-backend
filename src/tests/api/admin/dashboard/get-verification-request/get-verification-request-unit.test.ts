jest.mock("../../../../../api/admin/dashboard/services/database/verification-request", () => ({
  ...jest.requireActual(
    "../../../../../api/admin/dashboard/services/database/verification-request",
  ),
  getVerificationRequestForAdmin: jest.fn(),
}));
jest.mock("../../../../../utils/logger", () => ({ logger: { error: jest.fn(), info: jest.fn() } }));

import { getVerificationRequestHandler } from "../../../../../api/admin/dashboard/handlers/get-verification-request";
import { getVerificationRequestForAdmin } from "../../../../../api/admin/dashboard/services/database/verification-request";
import { callHandler, errorStatus } from "../../../../helpers/http";

const find = getVerificationRequestForAdmin as jest.Mock;

describe("getVerificationRequestHandler (unit)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns the request with display status, agent and reports", async () => {
    find.mockResolvedValue({
      id: "vr-1",
      status: "IN_PROGRESS",
      details: { propertyType: "Land" },
      createdAt: new Date("2026-01-08T09:00:00Z"),
      user: { id: "u1", fullName: "Ada", email: "a@x.com", phone: null, profilePhoto: null },
      verificationType: { name: "Land Verification" },
      verificationPlan: { name: "Monthly", frequency: "MONTHLY" },
      agentAssignment: { status: "ACCEPTED", agent: { id: "ag1", name: "Cynthia" } },
      transactions: [{ id: "t1", status: "SUCCESS" }],
      reports: [
        { id: "r1", reviewStatus: "PENDING", generatedAt: null, agent: { name: "Cynthia" } },
      ],
    });

    const { res } = await callHandler(getVerificationRequestHandler, { params: { id: "vr-1" } });

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "IN_PROGRESS",
        client: { id: "u1", name: "Ada", email: "a@x.com", phone: null, avatarUrl: null },
        verificationType: "Land Verification",
        agent: { id: "ag1", name: "Cynthia", assignmentStatus: "ACCEPTED" },
        reports: [{ id: "r1", reviewStatus: "PENDING", generatedAt: null, agentName: "Cynthia" }],
      }),
    );
  });

  it("returns 404 for an unknown request", async () => {
    find.mockResolvedValue(null);
    const { next } = await callHandler(getVerificationRequestHandler, { params: { id: "x" } });
    expect(errorStatus(next)).toBe(404);
  });

  it("returns 500 when the query fails", async () => {
    find.mockRejectedValue(new Error("db down"));
    const { next } = await callHandler(getVerificationRequestHandler, { params: { id: "x" } });
    expect(errorStatus(next)).toBe(500);
  });
});
