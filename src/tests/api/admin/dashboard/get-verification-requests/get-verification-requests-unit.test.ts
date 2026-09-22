import { NextFunction, Request, Response } from "express";
import getVerificationRequests from "../../../../../api/admin/dashboard/handlers/get-verification-requests";
import { getVerificationRequestsForAdmin } from "../../../../../api/admin/dashboard/services/database/verification-request";
import { HttpStatusCode } from "../../../../../exceptions";

jest.mock("../../../../../api/admin/dashboard/services/database/verification-request");
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedGetVerificationRequests = getVerificationRequestsForAdmin as jest.Mock;

function buildMockReqRes(query: Record<string, unknown>) {
  const req = { query } as unknown as Request;
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  } as unknown as Response;
  const next = jest.fn() as NextFunction;
  return { req, res, next };
}

describe("getVerificationRequests handler (unit)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("passes supported filters and pagination to the database service", async () => {
    const result = {
      data: [],
      meta: { page: 2, limit: 20, totalItems: 21, totalPages: 2 },
      counts: { all: 21, pending: 5, assigned: 4, inProgress: 6, completed: 6 },
    };
    mockedGetVerificationRequests.mockResolvedValue(result);
    const { req, res, next } = buildMockReqRes({
      status: "in_progress",
      search: "John",
      agentId: "agent-1",
      propertyType: "RESIDENTIAL",
      page: "2",
      limit: "20",
      sortBy: "status",
      sortOrder: "asc",
    });

    await getVerificationRequests(req, res, next);

    expect(mockedGetVerificationRequests).toHaveBeenCalledWith({
      status: "in_progress",
      search: "John",
      agentId: "agent-1",
      propertyType: "RESIDENTIAL",
      page: 2,
      limit: 20,
      sortBy: "status",
      sortOrder: "asc",
    });
    expect(res.status).toHaveBeenCalledWith(HttpStatusCode.OK);
    expect(res.json).toHaveBeenCalledWith(result);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects unsupported statuses", async () => {
    const { req, res, next } = buildMockReqRes({ status: "UNKNOWN" });

    await getVerificationRequests(req, res, next);

    expect(res.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.BAD_REQUEST }),
    );
  });

  it("maps database records to the dashboard response shape", async () => {
    mockedGetVerificationRequests.mockResolvedValue({
      data: [
        {
          id: "request-1",
          status: "SUBMITTED",
          details: { propertyType: "RESIDENTIAL", propertyAddress: "Lagos, Nigeria" },
          createdAt: new Date("2026-01-06T00:00:00.000Z"),
          updatedAt: new Date("2026-01-06T00:00:00.000Z"),
          user: {
            id: "user-1",
            fullName: "John Williams",
            email: "john@example.com",
            profilePhoto: "https://example.com/john.png",
          },
          verificationType: { id: "type-1", name: "Residential Property", slug: "residential" },
          agentAssignment: null,
          transactions: [],
        },
      ],
      meta: { page: 1, limit: 10, totalItems: 1, totalPages: 1 },
      counts: { all: 1, pending: 1, assigned: 0, inProgress: 0, completed: 0 },
    });
    const { req, res, next } = buildMockReqRes({});

    await getVerificationRequests(req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      data: [
        {
          id: "request-1",
          client: {
            id: "user-1",
            name: "John Williams",
            avatarUrl: "https://example.com/john.png",
          },
          propertyType: "RESIDENTIAL",
          location: { city: "Lagos", country: "Nigeria" },
          status: "PENDING",
          agent: null,
          createdAt: "2026-01-06T00:00:00.000Z",
        },
      ],
      meta: { page: 1, limit: 10, totalItems: 1, totalPages: 1 },
      counts: { all: 1, pending: 1, assigned: 0, inProgress: 0, completed: 0 },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects invalid sorting parameters", async () => {
    const { req, res, next } = buildMockReqRes({ sortBy: "clientName" });

    await getVerificationRequests(req, res, next);

    expect(res.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.BAD_REQUEST }),
    );
  });
});
