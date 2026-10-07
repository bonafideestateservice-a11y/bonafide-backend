jest.mock("../../../../../api/admin/verification/services/database/agent-assignment", () => ({
  setAgentStatus: jest.fn(),
}));
jest.mock("../../../../../utils/logger", () => ({ logger: { error: jest.fn(), info: jest.fn() } }));

import { updateAgentStatusHandler } from "../../../../../api/admin/dashboard/handlers/update-agent-status";
import { setAgentStatus } from "../../../../../api/admin/verification/services/database/agent-assignment";
import { callHandler, errorStatus } from "../../../../helpers/http";

const setStatus = setAgentStatus as jest.Mock;

describe("updateAgentStatusHandler (unit)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("suspends and reports what happened to open jobs", async () => {
    const result = { id: "ag1", status: "INACTIVE", reassigned: 2, unassigned: 1 };
    setStatus.mockResolvedValue(result);
    const { res } = await callHandler(updateAgentStatusHandler, {
      params: { id: "ag1" },
      body: { status: "INACTIVE" },
    });
    expect(setStatus).toHaveBeenCalledWith("ag1", "INACTIVE");
    expect(res.json).toHaveBeenCalledWith(result);
  });

  it.each([{}, { status: "SUSPENDED" }])("rejects body %j", async (body) => {
    const { next } = await callHandler(updateAgentStatusHandler, { params: { id: "ag1" }, body });
    expect(errorStatus(next)).toBe(400);
    expect(setStatus).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown agent", async () => {
    setStatus.mockResolvedValue(null);
    const { next } = await callHandler(updateAgentStatusHandler, {
      params: { id: "x" },
      body: { status: "ACTIVE" },
    });
    expect(errorStatus(next)).toBe(404);
  });

  it("returns 500 when the update fails", async () => {
    setStatus.mockRejectedValue(new Error("db down"));
    const { next } = await callHandler(updateAgentStatusHandler, {
      params: { id: "ag1" },
      body: { status: "ACTIVE" },
    });
    expect(errorStatus(next)).toBe(500);
  });
});
