import { Request, Response, NextFunction } from "express";
import { getVerificationRequestFullReport } from "../../../../../api/client/verification/handlers/get-verification-request-full-report";
import * as databaseService from "../../../../../api/client/verification/services/database/verification-request";
import { ApiError, HttpStatusCode, NotFoundError } from "../../../../../exceptions";
import { CustomRequest } from "../../../../../middlewares/check-jwt";

jest.mock("../../../../../api/client/verification/services/database/verification-request");

describe("GET /verification-requests/:id/report/full - Unit", () => {
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
    await getVerificationRequestFullReport(req as Request, res as Response, next);
    expect(next).toHaveBeenCalledWith(expect.any(ApiError));
    expect(next.mock.calls[0][0].statusCode).toBe(HttpStatusCode.UNAUTHORIZED);
  });

  it("should return 404 if request ID is missing", async () => {
    req.params = { id: "   " };
    await getVerificationRequestFullReport(req as Request, res as Response, next);
    expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
  });

  it("should return 404 if request/report is not found", async () => {
    (databaseService.getVerificationRequestFullReportForUser as jest.Mock).mockResolvedValue(null);
    await getVerificationRequestFullReport(req as Request, res as Response, next);
    expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
  });

  it("should return full report details successfully", async () => {
    const mockFullReport = {
      id: "req-123",
      details: { 
        propertyName: "Test Prop", 
        propertyAddress: "123 Main St",
        propertyType: "Commercial",
        plotSize: "500sqm",
        builtYear: "2010"
      },
      report: {
        id: "rep-456",
        generatedAt: new Date("2023-12-16T10:00:00Z"),
        reviewStatus: "APPROVED",
        summary: "This is a great property.",
        findings: [
          { label: "Ownership", value: "Fully Verified", status: "good" },
          { label: "Physical Condition", value: "Needs paint", status: "warning" }
        ]
      },
      agentAssignment: {
        agent: { name: "Jane Smith" },
        additionalNotes: "Agent noted some things.",
        checklistItems: [
          { label: "Front Door", media: [{ url: "http://example.com/photo1.jpg" }] },
          { label: "Backyard", media: [{ url: "http://example.com/photo2.jpg" }] }
        ]
      },
    };

    (databaseService.getVerificationRequestFullReportForUser as jest.Mock).mockResolvedValue(mockFullReport);

    await getVerificationRequestFullReport(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(HttpStatusCode.OK);
    expect(res.json).toHaveBeenCalledWith({
      status: "success",
      message: "Full report retrieved successfully",
      data: {
        id: "req-123",
        reportId: "rep-456",
        generatedAt: "2023-12-16T10:00:00.000Z",
        reviewStatus: "APPROVED",
        property: {
          name: "Test Prop",
          address: "123 Main St",
          type: "Commercial",
          plotSize: "500sqm",
          builtYear: "2010"
        },
        summary: "This is a great property.",
        ownershipFindings: "Fully Verified",
        findings: [
          { label: "Ownership", value: "Fully Verified", status: "good" },
          { label: "Physical Condition", value: "Needs paint", status: "warning" }
        ],
        photos: [
          { url: "http://example.com/photo1.jpg", label: "Front Door" },
          { url: "http://example.com/photo2.jpg", label: "Backyard" }
        ],
        agentNotes: "Agent noted some things.",
        agent: {
          firstName: "Jane",
          lastName: "Smith"
        }
      }
    });
  });
});
