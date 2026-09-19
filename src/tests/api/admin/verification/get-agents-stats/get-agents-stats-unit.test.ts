import { NextFunction, Request, Response } from "express";
import { getAgentsStats } from "../../../../../api/admin/verification/get-agents-stats";
import { getAgentStatsById } from "../../../../../api/admin/verification/services/database/agent-assignment";
import { getVerificationAgentByUserId } from "../../../../../api/admin/authentication/services/database/agent";
import { HttpStatusCode } from "../../../../../exceptions";

jest.mock(
  "../../../../../api/admin/verification/services/database/agent-assignment",
);
jest.mock("../../../../../api/admin/authentication/services/database/agent");
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedGetAgentStatsById = getAgentStatsById as jest.Mock;
const mockedGetVerificationAgentByUserId =
  getVerificationAgentByUserId as jest.Mock;

function buildMockReqRes() {
  const req = { user: { id: "user-1" } } as unknown as Request;
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  } as unknown as Response;
  const next = jest.fn() as NextFunction;
  return { req, res, next };
}

describe("getAgentsStats handler (unit)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns agent assignment statistics", async () => {
    mockedGetVerificationAgentByUserId.mockResolvedValue({ id: "agent-1" });
    mockedGetAgentStatsById.mockResolvedValue({
      activeCount: 3,
      completedCount: 12,
      avgRating: 4.8,
    });
    const { req, res, next } = buildMockReqRes();
    await getAgentsStats(req, res, next);
    expect(res.status).toHaveBeenCalledWith(HttpStatusCode.OK);
    expect(res.json).toHaveBeenCalledWith({
      activeCount: 3,
      completedCount: 12,
      avgRating: 4.8,
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("forwards database errors", async () => {
    mockedGetVerificationAgentByUserId.mockResolvedValue({ id: "agent-1" });
    mockedGetAgentStatsById.mockRejectedValue(new Error("DB exploded"));
    const { req, res, next } = buildMockReqRes();
    await getAgentsStats(req, res, next);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.INTERNAL_SERVER }),
    );
  });
});
