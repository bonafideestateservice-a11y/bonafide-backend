jest.mock("../../../../../api/admin/verification/services/database/agent-assignment", () => ({
  createAgent: jest.fn(),
}));
jest.mock("../../../../../utils/logger", () => ({ logger: { error: jest.fn(), info: jest.fn() } }));

import { createAgentHandler } from "../../../../../api/admin/dashboard/handlers/create-agent";
import { createAgent } from "../../../../../api/admin/verification/services/database/agent-assignment";
import { callHandler, errorStatus } from "../../../../helpers/http";

const create = createAgent as jest.Mock;

describe("createAgentHandler (unit)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("creates the agent with trimmed fields and returns 201", async () => {
    const agent = { id: "ag1", email: "john@example.com" };
    create.mockResolvedValue(agent);
    const { res } = await callHandler(createAgentHandler, {
      body: {
        fullName: " John Anderson ",
        email: " John@Example.com ",
        phone: " ",
        region: "Lagos",
      },
    });
    expect(create).toHaveBeenCalledWith({
      fullName: "John Anderson",
      email: "john@example.com",
      phone: null,
      region: "Lagos",
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(agent);
  });

  it.each([
    {},
    { fullName: "John" },
    { fullName: "John", email: "not-an-email" },
    { fullName: " ", email: "john@example.com" },
    { fullName: "John", email: "john@example.com", phone: 123 },
  ])("rejects body %j", async (body) => {
    const { next } = await callHandler(createAgentHandler, { body });
    expect(errorStatus(next)).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it("returns 409 when the email is taken", async () => {
    create.mockResolvedValue(null);
    const { next } = await callHandler(createAgentHandler, {
      body: { fullName: "John", email: "john@example.com" },
    });
    expect(errorStatus(next)).toBe(409);
  });

  it("returns 500 when creating fails", async () => {
    create.mockRejectedValue(new Error("db down"));
    const { next } = await callHandler(createAgentHandler, {
      body: { fullName: "John", email: "john@example.com" },
    });
    expect(errorStatus(next)).toBe(500);
  });
});
