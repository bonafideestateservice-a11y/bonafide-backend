jest.mock("../../../../../api/admin/verification/services/database/agent-assignment", () => ({
  unassignAgentFromVerificationRequest: jest.fn(),
}));
jest.mock("../../../../../utils/logger", () => ({ logger: { error: jest.fn(), info: jest.fn() } }));

import { unassignVerificationRequestAgent } from "../../../../../api/admin/verification/handlers/unassign-verification-request-agent";
import { unassignAgentFromVerificationRequest } from "../../../../../api/admin/verification/services/database/agent-assignment";
import { callHandler, errorStatus } from "../../../../helpers/http";

const unassign = unassignAgentFromVerificationRequest as jest.Mock;

describe("unassignVerificationRequestAgent (unit)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("unassigns and returns the request to pending", async () => {
    unassign.mockResolvedValue("UNASSIGNED");
    const { res } = await callHandler(unassignVerificationRequestAgent, { params: { id: "vr-1" } });
    expect(unassign).toHaveBeenCalledWith("vr-1");
    expect(res.json).toHaveBeenCalledWith({ verificationRequestId: "vr-1", status: "PENDING" });
  });

  it.each([
    ["NOT_ASSIGNED", 404],
    ["REPORT_SUBMITTED", 409],
  ])("maps %s to %s", async (result, status) => {
    unassign.mockResolvedValue(result);
    const { next } = await callHandler(unassignVerificationRequestAgent, {
      params: { id: "vr-1" },
    });
    expect(errorStatus(next)).toBe(status);
  });

  it("returns 500 when the update fails", async () => {
    unassign.mockRejectedValue(new Error("db down"));
    const { next } = await callHandler(unassignVerificationRequestAgent, {
      params: { id: "vr-1" },
    });
    expect(errorStatus(next)).toBe(500);
  });
});
