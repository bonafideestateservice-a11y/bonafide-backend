import { Request, Response, NextFunction } from "express";
import { getVerificationRequestReportSummary } from "../../../../../api/client/verification/handlers/get-verification-request-report-summary";
import * as databaseService from "../../../../../api/client/verification/services/database/verification-request";
import { ApiError, HttpStatusCode, NotFoundError } from "../../../../../exceptions";
import { CustomRequest } from "../../../../../middlewares/check-jwt";

jest.mock("../../../../../api/client/verification/services/database/verification-request");

describe("GET /verification-requests/:id/report-summary - Unit", () => {
  let req: Partial<CustomRequest>;
  let res: Partial<Response>;
  let next: jest.Mock;

  beforeEach(() => {
    req = {
      params: { id: "req-123" },
      user: { id: "user-123" } as any,
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    next = jest.fn();
    jest.clearAllMocks();
  });

  it("should return 401 if user is not authenticated", async () => {
    req.user = undefined;
    req.token = undefined;
    await getVerificationRequestReportSummary(req as Request, res as Response, next);
    expect(next).toHaveBeenCalledWith(expect.any(ApiError));
    expect(next.mock.calls[0][0].statusCode).toBe(HttpStatusCode.UNAUTHORIZED);
  });

  it("should return 404 if request ID is missing", async () => {
    req.params = { id: "   " };
    await getVerificationRequestReportSummary(req as Request, res as Response, next);
    expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
  });

  it("should return 404 if request is not found", async () => {
    (databaseService.getVerificationRequestReportSummaryForUser as jest.Mock).mockResolvedValue(null);
    await getVerificationRequestReportSummary(req as Request, res as Response, next);
    expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
  });

  it("should return report summary details successfully", async () => {
    const mockSummary = {
      details: { propertyAddress: "123 Main St", propertyName: "Test Prop" },
      report: {
        generatedAt: new Date("2023-12-16T10:00:00Z"),
        findings: [
          { label: "Ownership", value: "Verified", status: "good" }
        ]
      },
      agentAssignment: {
        agent: { name: "John Doe" },
        checklistItems: [
          { media: [{ url: "http://example.com/photo1.jpg" }] },
          { media: [{ url: "http://example.com/photo2.jpg" }] }
        ]
      },
      verificationPlan: {
        name: "Standard Plan"
      }
    };

    (databaseService.getVerificationRequestReportSummaryForUser as jest.Mock).mockResolvedValue(mockSummary);

    await getVerificationRequestReportSummary(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(HttpStatusCode.OK);
    expect(res.json).toHaveBeenCalledWith({
      status: "success",
      message: "Report summary retrieved successfully",
      data: {
        property: "Test Prop",
        inspectionDate: "2023-12-16T10:00:00.000Z",
        agent: {
          firstName: "John",
          lastName: "Doe"
        },
        location: "123 Main St",
        reportType: "Standard Plan",
        insights: [
          { label: "Ownership", value: "Verified", status: "good" }
        ],
        mediaPreview: [
          { url: "http://example.com/photo1.jpg" },
          { url: "http://example.com/photo2.jpg" }
        ]
      }
    });
  });
});
