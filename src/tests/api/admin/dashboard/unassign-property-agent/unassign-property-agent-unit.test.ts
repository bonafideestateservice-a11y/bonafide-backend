import { unassignPropertyAgentHandler } from "../../../../../api/admin/dashboard/handlers/unassign-property-agent";
import { setPropertyAgent } from "../../../../../api/admin/dashboard/services/database/property";
import { callHandler, errorStatus } from "../../../../helpers/http";

jest.mock("../../../../../api/admin/dashboard/services/database/property");
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedSetAgent = setPropertyAgent as jest.Mock;
const call = () => callHandler(unassignPropertyAgentHandler, { params: { id: "p1" } });

describe("unassignPropertyAgentHandler (unit)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("clears the agent", async () => {
    const updatedAt = new Date("2026-10-12T00:00:00.000Z");
    mockedSetAgent.mockResolvedValue({ id: "p1", updatedAt, agent: null });

    const { res } = await call();

    expect(mockedSetAgent).toHaveBeenCalledWith("p1", null);
    expect(res.json).toHaveBeenCalledWith({
      id: "p1",
      agent: null,
      updatedAt: updatedAt.toISOString(),
    });
  });

  it("returns 404 for a missing or deleted property and 500 on other errors", async () => {
    mockedSetAgent.mockRejectedValueOnce(Object.assign(new Error("nf"), { code: "P2025" }));
    expect(errorStatus((await call()).next)).toBe(404);
    mockedSetAgent.mockRejectedValueOnce(new Error("db down"));
    expect(errorStatus((await call()).next)).toBe(500);
  });
});
