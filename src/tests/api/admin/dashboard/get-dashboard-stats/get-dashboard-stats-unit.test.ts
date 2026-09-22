import { NextFunction, Request, Response } from "express";
import getDashboardStats from "../../../../../api/admin/dashboard/handlers/get-dashboard-stats";
import { getDashboardStats as getDashboardStatsFromDatabase } from "../../../../../api/admin/dashboard/services/database/dashboard";
import { HttpStatusCode } from "../../../../../exceptions";

jest.mock("../../../../../api/admin/dashboard/services/database/dashboard");
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedGetDashboardStats = getDashboardStatsFromDatabase as jest.Mock;

function buildMockReqRes() {
  const req = {} as Request;
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  } as unknown as Response;
  const next = jest.fn() as NextFunction;
  return { req, res, next };
}

describe("getDashboardStats handler (unit)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns dashboard statistics", async () => {
    mockedGetDashboardStats.mockResolvedValue({
      totalUsers: 10,
      numberOfPendingRequest: 4,
      numberOfActiveAgents: 3,
      numberOfProperties: 7,
    });
    const { req, res, next } = buildMockReqRes();

    await getDashboardStats(req, res, next);

    expect(res.status).toHaveBeenCalledWith(HttpStatusCode.OK);
    expect(res.json).toHaveBeenCalledWith({
      totalUsers: 10,
      numberOfPendingRequest: 4,
      numberOfActiveAgents: 3,
      numberOfProperties: 7,
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("forwards database errors", async () => {
    mockedGetDashboardStats.mockRejectedValue(new Error("DB exploded"));
    const { req, res, next } = buildMockReqRes();

    await getDashboardStats(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.INTERNAL_SERVER }),
    );
  });
});
