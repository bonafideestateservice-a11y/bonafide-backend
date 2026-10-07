import { updateUserStatusHandler } from "../../../../../api/admin/dashboard/handlers/update-user-status";
import {
  findUserForStatusChange,
  setUserStatus,
} from "../../../../../api/admin/dashboard/services/database/user";
import { setAgentStatus } from "../../../../../api/admin/verification/services/database/agent-assignment";
import { callHandler, errorStatus } from "../../../../helpers/http";

jest.mock("../../../../../api/admin/dashboard/services/database/user");
jest.mock("../../../../../api/admin/verification/services/database/agent-assignment");
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedFind = findUserForStatusChange as jest.Mock;
const mockedSetUser = setUserStatus as jest.Mock;
const mockedSetAgent = setAgentStatus as jest.Mock;
const call = (body: unknown) =>
  callHandler(updateUserStatusHandler, { params: { id: "u1" }, body });

describe("updateUserStatusHandler (unit)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("suspends a client", async () => {
    mockedFind.mockResolvedValue({ id: "u1", role: "CLIENT", verificationAgent: null });
    mockedSetUser.mockResolvedValue({ id: "u1", status: "SUSPENDED" });

    const { res } = await call({ status: "SUSPENDED" });

    expect(mockedSetUser).toHaveBeenCalledWith("u1", "SUSPENDED");
    expect(res.json).toHaveBeenCalledWith({
      id: "u1",
      status: "SUSPENDED",
      reassigned: 0,
      unassigned: 0,
    });
  });

  it.each([
    ["SUSPENDED", "INACTIVE"],
    ["ACTIVE", "ACTIVE"],
  ])("sets an agent to %s through the agent status (%s)", async (status, agentStatus) => {
    mockedFind.mockResolvedValue({ id: "u1", role: "AGENT", verificationAgent: { id: "a1" } });
    mockedSetAgent.mockResolvedValue({
      id: "a1",
      status: agentStatus,
      reassigned: 2,
      unassigned: 1,
    });

    const { res } = await call({ status });

    expect(mockedSetAgent).toHaveBeenCalledWith("a1", agentStatus);
    expect(mockedSetUser).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ id: "u1", status, reassigned: 2, unassigned: 1 });
  });

  it.each([[{}], [{ status: "INACTIVE" }]])("returns 400 for body %j", async (body) => {
    const { next } = await call(body);
    expect(errorStatus(next)).toBe(400);
    expect(mockedFind).not.toHaveBeenCalled();
  });

  it("returns 404 for unknown users and admins", async () => {
    mockedFind.mockResolvedValueOnce(null);
    expect(errorStatus((await call({ status: "SUSPENDED" })).next)).toBe(404);
    mockedFind.mockResolvedValueOnce({ id: "u1", role: "ADMIN", verificationAgent: null });
    expect(errorStatus((await call({ status: "SUSPENDED" })).next)).toBe(404);
    expect(mockedSetUser).not.toHaveBeenCalled();
  });

  it("returns 500 when the update fails", async () => {
    mockedFind.mockRejectedValue(new Error("db down"));
    expect(errorStatus((await call({ status: "SUSPENDED" })).next)).toBe(500);
  });
});
