import { NextFunction, Request, Response } from "express";
import { getVerificationRequestReports } from "../../../../../api/client/verification/handlers/get-verification-request-reports";
import { getVerificationRequestReportsForUser } from "../../../../../api/client/verification/services/database/verification-request";
import { HttpStatusCode } from "../../../../../exceptions";

jest.mock("../../../../../api/client/verification/services/database/verification-request");
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedGetReports = getVerificationRequestReportsForUser as jest.Mock;

const buildReqRes = (userId?: string) => {
  const req = {
    user: userId ? { id: userId } : undefined,
    params: { id: "request-1" },
  } as unknown as Request;
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  } as unknown as Response;
  return { req, res, next: jest.fn() as NextFunction };
};

describe("getVerificationRequestReports handler (unit)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns every report with the period it covers, newest first", async () => {
    mockedGetReports.mockResolvedValue([
      {
        id: "report-2",
        generatedAt: new Date("2026-10-05T10:00:00Z"),
        reviewStatus: "PENDING",
        viewedAt: null,
        agent: { name: "Tunde Bello" },
        transaction: {
          paidAt: new Date("2026-10-01T08:00:00Z"),
          amountInCents: 500000,
          currency: "NGN",
        },
      },
      {
        id: "report-1",
        generatedAt: null,
        reviewStatus: "APPROVED",
        viewedAt: new Date("2026-09-10T10:00:00Z"),
        agent: { name: "Ada" },
        transaction: null,
      },
    ]);
    const { req, res, next } = buildReqRes("user-1");

    await getVerificationRequestReports(req, res, next);

    expect(mockedGetReports).toHaveBeenCalledWith("request-1", "user-1");
    expect(res.status).toHaveBeenCalledWith(HttpStatusCode.OK);
    expect(res.json).toHaveBeenCalledWith({
      status: "success",
      message: "Verification reports retrieved successfully",
      data: [
        {
          id: "report-2",
          generatedAt: "2026-10-05T10:00:00.000Z",
          reviewStatus: "PENDING",
          viewed: false,
          agent: { firstName: "Tunde", lastName: "Bello" },
          payment: {
            paidAt: "2026-10-01T08:00:00.000Z",
            amountInCents: 500000,
            currency: "NGN",
          },
        },
        {
          id: "report-1",
          generatedAt: null,
          reviewStatus: "APPROVED",
          viewed: true,
          agent: { firstName: "Ada", lastName: "" },
          payment: null,
        },
      ],
    });
  });

  it("returns an empty list when the request has no reports yet", async () => {
    mockedGetReports.mockResolvedValue([]);
    const { req, res, next } = buildReqRes("user-1");

    await getVerificationRequestReports(req, res, next);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: [] }));
  });

  it("returns 404 when the request doesn't belong to the user", async () => {
    mockedGetReports.mockResolvedValue(null);
    const { req, res, next } = buildReqRes("user-1");

    await getVerificationRequestReports(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.NOT_FOUND }),
    );
  });

  it("returns 401 without an authenticated user", async () => {
    const { req, res, next } = buildReqRes();

    await getVerificationRequestReports(req, res, next);

    expect(mockedGetReports).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.UNAUTHORIZED }),
    );
  });

  it("returns 500 when the lookup fails", async () => {
    mockedGetReports.mockRejectedValue(new Error("database down"));
    const { req, res, next } = buildReqRes("user-1");

    await getVerificationRequestReports(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.INTERNAL_SERVER }),
    );
  });
});
