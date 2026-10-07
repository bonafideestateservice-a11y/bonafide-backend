import { getUsersHandler } from "../../../../../api/admin/dashboard/handlers/get-users";
import { getUsers } from "../../../../../api/admin/dashboard/services/database/user";
import { callHandler, errorStatus } from "../../../../helpers/http";

jest.mock("../../../../../api/admin/dashboard/services/database/user");
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedGetUsers = getUsers as jest.Mock;
const joined = new Date("2026-01-05T00:00:00.000Z");
const row = (overrides: object) => ({
  id: "u1",
  fullName: "John Williams",
  email: "john@example.com",
  phone: "+234",
  profilePhoto: null,
  role: "CLIENT",
  status: "ACTIVE",
  createdAt: joined,
  verificationAgent: null,
  ...overrides,
});

describe("getUsersHandler (unit)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("maps users and marks suspended agents", async () => {
    mockedGetUsers.mockResolvedValue({
      data: [
        row({}),
        row({ id: "u2", role: "AGENT", verificationAgent: { id: "a2", status: "INACTIVE" } }),
        row({ id: "u3", status: "SUSPENDED" }),
      ],
      meta: { page: 1, limit: 20, totalItems: 3, totalPages: 1 },
      counts: { all: 3, client: 2, agent: 1 },
    });

    const { res } = await callHandler(getUsersHandler, {
      query: { type: "all", search: "john", page: "1" },
    });

    expect(mockedGetUsers).toHaveBeenCalledWith("all", "john", 1, 20);
    const body = res.json.mock.calls[0][0];
    expect(body.data[0]).toEqual({
      id: "u1",
      agentId: null,
      name: "John Williams",
      email: "john@example.com",
      phone: "+234",
      avatarUrl: null,
      type: "CLIENT",
      status: "ACTIVE",
      joinedAt: joined.toISOString(),
    });
    expect(body.data[1]).toMatchObject({ agentId: "a2", type: "AGENT", status: "SUSPENDED" });
    expect(body.data[2].status).toBe("SUSPENDED");
    expect(body.counts).toEqual({ all: 3, client: 2, agent: 1 });
  });

  it.each([[{ type: "admin" }], [{ page: "0" }], [{ limit: "101" }]])(
    "returns 400 for query %j",
    async (query) => {
      const { next } = await callHandler(getUsersHandler, { query });
      expect(errorStatus(next)).toBe(400);
      expect(mockedGetUsers).not.toHaveBeenCalled();
    },
  );

  it("returns 500 when the query fails", async () => {
    mockedGetUsers.mockRejectedValue(new Error("db down"));
    const { next } = await callHandler(getUsersHandler);
    expect(errorStatus(next)).toBe(500);
  });
});
