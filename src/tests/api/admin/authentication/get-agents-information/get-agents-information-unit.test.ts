import { NextFunction, Request, Response } from "express";
import { getAgentsInformation } from "../../../../../api/admin/authentication/handlers/get-agents-information";
import { getVerificationAgentByUserId } from "../../../../../api/admin/authentication/services/database/agent";
import { HttpStatusCode } from "../../../../../exceptions";

jest.mock("../../../../../api/admin/authentication/services/database/agent");
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

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

describe("getAgentsInformation handler (unit)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns agent information without credentials", async () => {
    mockedGetVerificationAgentByUserId.mockResolvedValue({
      id: "agent-1",
      user: { fullName: "Jane Agent" },
    });
    const { req, res, next } = buildMockReqRes();

    await getAgentsInformation(req, res, next);

    expect(res.status).toHaveBeenCalledWith(HttpStatusCode.OK);
    expect(res.json).toHaveBeenCalledWith({
      id: "agent-1",
      firstName: "Jane",
      lastName: "Agent",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("forwards database errors", async () => {
    mockedGetVerificationAgentByUserId.mockRejectedValue(
      new Error("DB exploded"),
    );
    const { req, res, next } = buildMockReqRes();

    await getAgentsInformation(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.INTERNAL_SERVER }),
    );
  });
});
