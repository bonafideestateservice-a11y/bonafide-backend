import { getUserHandler } from "../../../../../api/admin/dashboard/handlers/get-user";
import { getClientProfile } from "../../../../../api/admin/dashboard/services/database/user";
import { callHandler, errorStatus } from "../../../../helpers/http";

jest.mock("../../../../../api/admin/dashboard/services/database/user");
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedProfile = getClientProfile as jest.Mock;

describe("getUserHandler (unit)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns the client's profile", async () => {
    const createdAt = new Date("2025-02-20T00:00:00.000Z");
    const stats = { paidRequests: 8, totalSpent: 125000, averageResponseDays: 3 };
    mockedProfile.mockResolvedValue({
      user: {
        id: "u1",
        fullName: "Kingsley Wilson",
        email: "k@example.com",
        phone: null,
        location: "Lagos",
        profilePhoto: null,
        status: "ACTIVE",
        createdAt,
      },
      stats,
      recentActivity: [],
    });

    const { res } = await callHandler(getUserHandler, { params: { id: "u1" } });

    expect(mockedProfile).toHaveBeenCalledWith("u1");
    expect(res.json).toHaveBeenCalledWith({
      id: "u1",
      name: "Kingsley Wilson",
      email: "k@example.com",
      phone: null,
      location: "Lagos",
      avatarUrl: null,
      status: "ACTIVE",
      memberSince: createdAt.toISOString(),
      stats,
      recentActivity: [],
    });
  });

  it("returns 404 for unknown users and non-clients", async () => {
    mockedProfile.mockResolvedValue(null);
    const { next } = await callHandler(getUserHandler, { params: { id: "x" } });
    expect(errorStatus(next)).toBe(404);
  });

  it("returns 500 when the query fails", async () => {
    mockedProfile.mockRejectedValue(new Error("db down"));
    const { next } = await callHandler(getUserHandler, { params: { id: "x" } });
    expect(errorStatus(next)).toBe(500);
  });
});
