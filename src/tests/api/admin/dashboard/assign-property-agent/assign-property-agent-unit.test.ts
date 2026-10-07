import { assignPropertyAgentHandler } from "../../../../../api/admin/dashboard/handlers/assign-property-agent";
import {
  countAgentProperties,
  findAgentStatus,
  setPropertyAgent,
} from "../../../../../api/admin/dashboard/services/database/property";
import { callHandler, errorStatus } from "../../../../helpers/http";

jest.mock("../../../../../api/admin/dashboard/services/database/property", () => ({
  MAX_AGENT_PROPERTIES: 5,
  countAgentProperties: jest.fn(),
  findAgentStatus: jest.fn(),
  setPropertyAgent: jest.fn(),
}));
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedFindAgent = findAgentStatus as jest.Mock;
const mockedSetAgent = setPropertyAgent as jest.Mock;
const mockedCount = countAgentProperties as jest.Mock;
const call = (body: unknown) =>
  callHandler(assignPropertyAgentHandler, { params: { id: "p1" }, body });

describe("assignPropertyAgentHandler (unit)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedFindAgent.mockResolvedValue({ status: "ACTIVE" });
    mockedCount.mockResolvedValue(4);
  });

  it("assigns the agent", async () => {
    const updatedAt = new Date("2026-10-12T00:00:00.000Z");
    mockedSetAgent.mockResolvedValue({ id: "p1", updatedAt, agent: { id: "a1", name: "Kim" } });

    const { res } = await call({ agentId: " a1 " });

    expect(mockedCount).toHaveBeenCalledWith("a1", "p1");
    expect(mockedSetAgent).toHaveBeenCalledWith("p1", "a1");
    expect(res.json).toHaveBeenCalledWith({
      id: "p1",
      agent: { id: "a1", name: "Kim" },
      updatedAt: updatedAt.toISOString(),
    });
  });

  it.each([[{}], [{ agentId: " " }], [{ agentId: 5 }]])("returns 400 for body %j", async (body) => {
    expect(errorStatus((await call(body)).next)).toBe(400);
    expect(mockedSetAgent).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown agent and 400 for a suspended one", async () => {
    mockedFindAgent.mockResolvedValueOnce(null);
    expect(errorStatus((await call({ agentId: "a1" })).next)).toBe(404);
    mockedFindAgent.mockResolvedValueOnce({ status: "INACTIVE" });
    expect(errorStatus((await call({ agentId: "a1" })).next)).toBe(400);
    expect(mockedSetAgent).not.toHaveBeenCalled();
  });

  it("returns 409 when the agent already has 5 properties", async () => {
    mockedCount.mockResolvedValue(5);
    const { next } = await call({ agentId: "a1" });
    expect(errorStatus(next)).toBe(409);
    expect(next.mock.calls[0][0].message).toBe(
      "Agent is fully booked. Agents can only handle 5 properties at a time.",
    );
    expect(mockedSetAgent).not.toHaveBeenCalled();
  });

  it("returns 404 for a missing or deleted property and 500 on other errors", async () => {
    mockedSetAgent.mockRejectedValueOnce(Object.assign(new Error("nf"), { code: "P2025" }));
    expect(errorStatus((await call({ agentId: "a1" })).next)).toBe(404);
    mockedSetAgent.mockRejectedValueOnce(new Error("db down"));
    expect(errorStatus((await call({ agentId: "a1" })).next)).toBe(500);
  });
});
