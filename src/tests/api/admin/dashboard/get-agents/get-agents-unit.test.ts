jest.mock("../../../../../api/admin/authentication/services/database/agent", () => ({
  ...jest.requireActual("../../../../../api/admin/authentication/services/database/agent"),
  listVerificationAgents: jest.fn(),
}));
jest.mock("../../../../../utils/logger", () => ({ logger: { error: jest.fn(), info: jest.fn() } }));

import { getAgentsHandler } from "../../../../../api/admin/dashboard/handlers/get-agents";
import { listVerificationAgents } from "../../../../../api/admin/authentication/services/database/agent";
import { callHandler, errorStatus } from "../../../../helpers/http";

const list = listVerificationAgents as jest.Mock;
const agent = (id: string, status: string, open: number) => ({
  id,
  name: id,
  phone: null,
  region: "Lagos",
  status,
  user: { email: `${id}@example.com`, profilePhoto: null },
  _count: { assignments: open },
});

describe("getAgentsHandler (unit)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    list.mockResolvedValue([
      agent("available", "ACTIVE", 3),
      agent("busy", "ACTIVE", 5),
      agent("suspended", "INACTIVE", 0),
    ]);
  });

  it("labels each agent and counts the tabs", async () => {
    const { res } = await callHandler(getAgentsHandler);
    const body = res.json.mock.calls[0][0];
    expect(body.data.map((a: { displayStatus: string }) => a.displayStatus)).toEqual([
      "AVAILABLE",
      "BUSY",
      "SUSPENDED",
    ]);
    expect(body.data[0]).toMatchObject({ email: "available@example.com", activeAssignments: 3 });
    expect(body.counts).toEqual({ all: 3, active: 1, busy: 1, suspended: 1 });
  });

  it.each([
    ["active", "available"],
    ["busy", "busy"],
  ])("tab=%s shows only %s agents", async (tab, id) => {
    const { res } = await callHandler(getAgentsHandler, { query: { tab } });
    expect(res.json.mock.calls[0][0].data.map((a: { id: string }) => a.id)).toEqual([id]);
  });

  it("passes search through", async () => {
    await callHandler(getAgentsHandler, { query: { search: "lagos" } });
    expect(list).toHaveBeenCalledWith("lagos");
  });

  it("rejects an unknown tab", async () => {
    const { next } = await callHandler(getAgentsHandler, { query: { tab: "suspended" } });
    expect(errorStatus(next)).toBe(400);
  });

  it("returns 500 when the query fails", async () => {
    list.mockRejectedValue(new Error("db down"));
    const { next } = await callHandler(getAgentsHandler);
    expect(errorStatus(next)).toBe(500);
  });
});
