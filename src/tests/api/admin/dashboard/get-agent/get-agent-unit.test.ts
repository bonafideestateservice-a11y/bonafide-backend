import { getAgentHandler } from "../../../../../api/admin/dashboard/handlers/get-agent";
import { getAgentProfile } from "../../../../../api/admin/dashboard/services/database/user";
import { callHandler, errorStatus } from "../../../../helpers/http";

jest.mock("../../../../../api/admin/dashboard/services/database/user");
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedProfile = getAgentProfile as jest.Mock;
const date = new Date("2025-02-20T00:00:00.000Z");
const profile = (suspended: boolean, openJobs: number) => ({
  agent: {
    id: "a1",
    name: "Kingsley Wilson",
    phone: null,
    region: "Lagos",
    status: "ACTIVE",
    createdAt: date,
    user: { id: "u1", email: "k@example.com", phone: "+234", profilePhoto: null, status: "ACTIVE" },
  },
  suspended,
  activeAssignments: openJobs,
  properties: [
    {
      id: "p1",
      number: 1,
      name: "4 Bedroom Duplex",
      propertyType: "RESIDENTIAL",
      area: "Lekki Phase 1",
      priceAmount: BigInt(85000000),
      viewCount: 1500,
      createdAt: date,
    },
  ],
  stats: { totalVerifications: 56, successRate: 89, averageResponseDays: 3 },
});

describe("getAgentHandler (unit)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns the agent's profile and assigned properties", async () => {
    mockedProfile.mockResolvedValue(profile(false, 1));

    const { res } = await callHandler(getAgentHandler, { params: { id: "a1" } });

    expect(mockedProfile).toHaveBeenCalledWith("a1");
    expect(res.json).toHaveBeenCalledWith({
      id: "a1",
      userId: "u1",
      name: "Kingsley Wilson",
      email: "k@example.com",
      phone: "+234",
      region: "Lagos",
      avatarUrl: null,
      displayStatus: "AVAILABLE",
      assignedPropertyCount: 1,
      maxAssignedProperties: 5,
      memberSince: date.toISOString(),
      stats: { totalVerifications: 56, successRate: 89, averageResponseDays: 3 },
      assignedProperties: [
        expect.objectContaining({
          id: "p1",
          title: "4 Bedroom Duplex",
          type: "RESIDENTIAL",
          price: expect.objectContaining({ amount: 85000000 }),
          viewCount: 1500,
        }),
      ],
    });
  });

  it.each([
    [true, 0, "SUSPENDED"],
    [false, 5, "BUSY"],
  ])("suspended=%s with %s jobs is %s", async (suspended, jobs, displayStatus) => {
    mockedProfile.mockResolvedValue(profile(suspended, jobs));
    const { res } = await callHandler(getAgentHandler, { params: { id: "a1" } });
    expect(res.json.mock.calls[0][0].displayStatus).toBe(displayStatus);
  });

  it("returns 404 for unknown agents and 500 when the query fails", async () => {
    mockedProfile.mockResolvedValueOnce(null);
    expect(errorStatus((await callHandler(getAgentHandler, { params: { id: "x" } })).next)).toBe(
      404,
    );
    mockedProfile.mockRejectedValueOnce(new Error("db down"));
    expect(errorStatus((await callHandler(getAgentHandler, { params: { id: "x" } })).next)).toBe(
      500,
    );
  });
});
