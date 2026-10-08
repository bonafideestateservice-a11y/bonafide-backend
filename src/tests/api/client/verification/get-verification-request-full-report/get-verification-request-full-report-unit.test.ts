import { Request, Response } from "express";
import { getVerificationRequestFullReport } from "../../../../../api/client/verification/handlers/get-verification-request-full-report";
import * as databaseService from "../../../../../api/client/verification/services/database/verification-request";
import { ForbiddenError, HttpStatusCode, NotFoundError } from "../../../../../exceptions";

jest.mock("../../../../../api/client/verification/services/database/verification-request");

describe("GET /verification-requests/:id/report/full - Unit", () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: jest.Mock;

  beforeEach(() => {
    req = {
      params: { id: "req-123" },
      user: { id: "user-1" },
    } as Partial<Request>;
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    next = jest.fn();
    jest.clearAllMocks();
  });

  it("should return 404 if request ID is missing", async () => {
    req.params = { id: "   " };
    await getVerificationRequestFullReport(req as Request, res as Response, next);
    expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
  });

  it("should return 404 if request/report is not found", async () => {
    (databaseService.getVerificationRequestFullReportData as jest.Mock).mockResolvedValue(null);
    await getVerificationRequestFullReport(req as Request, res as Response, next);
    expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
  });

  it("should return full report details successfully", async () => {
    const mockFullReport = {
      id: "req-123",
      userId: "user-1",
      user: { fullName: "John Anderson", phone: "+234 801 234 5678", email: "john@example.com" },
      details: {
        propertyName: "Test Prop",
        propertyAddress: "123 Main St",
        propertyType: "Commercial",
        plotSize: "500sqm",
        builtYear: "2010",
      },
      reports: [
        {
          id: "rep-456",
          generatedAt: new Date("2023-12-16T10:00:00Z"),
          reviewStatus: "APPROVED",
          summary: "This is a great property.",
          findings: [
            { label: "Ownership", value: "Fully Verified", status: "good" },
            { label: "Physical Condition", value: "Needs paint", status: "warning" },
          ],
          // The report keeps its own agent, notes and checklist.
          agent: { name: "Jane Smith" },
          additionalNotes: "Agent noted some things.",
          rating: null,
          clientComment: null,
          ratedAt: null,
          checklistItems: [
            { label: "Front Door", media: [{ url: "http://example.com/photo1.jpg" }] },
            { label: "Backyard", media: [{ url: "http://example.com/photo2.jpg" }] },
          ],
        },
      ],
      // Recurring assignments are deleted once their period is reported.
      agentAssignment: null,
    };

    (databaseService.getVerificationRequestFullReportData as jest.Mock).mockResolvedValue(
      mockFullReport,
    );

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
        client: { name: "John Anderson", phone: "+234 801 234 5678", email: "john@example.com" },
        property: {
          name: "Test Prop",
          address: "123 Main St",
          type: "Commercial",
          plotSize: "500sqm",
          builtYear: "2010",
        },
        summary: "This is a great property.",
        ownershipFindings: "Fully Verified",
        findings: [
          { label: "Ownership", value: "Fully Verified", status: "good" },
          { label: "Physical Condition", value: "Needs paint", status: "warning" },
        ],
        photos: [
          { url: "http://example.com/photo1.jpg", label: "Front Door" },
          { url: "http://example.com/photo2.jpg", label: "Backyard" },
        ],
        agentNotes: "Agent noted some things.",
        agent: {
          firstName: "Jane",
          lastName: "Smith",
        },
        feedback: null,
      },
    });
  });

  it("returns 403 when the request belongs to another client", async () => {
    (databaseService.getVerificationRequestFullReportData as jest.Mock).mockResolvedValue({
      id: "req-123",
      userId: "someone-else",
      reports: [],
    });
    await getVerificationRequestFullReport(req as Request, res as Response, next);
    expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns the client's feedback once they've left some", async () => {
    const ratedAt = new Date("2026-10-08T14:02:11.000Z");
    (databaseService.getVerificationRequestFullReportData as jest.Mock).mockResolvedValue({
      id: "req-123",
      userId: "user-1",
      user: { fullName: "John Anderson", phone: null, email: "john@example.com" },
      details: {},
      reports: [
        {
          id: "rep-456",
          generatedAt: null,
          reviewStatus: "APPROVED",
          summary: null,
          findings: null,
          agent: null,
          additionalNotes: null,
          checklistItems: [],
          rating: 4,
          clientComment: "Thorough inspection.",
          ratedAt,
        },
      ],
      agentAssignment: null,
    });
    await getVerificationRequestFullReport(req as Request, res as Response, next);
    expect((res.json as jest.Mock).mock.calls[0][0].data.feedback).toEqual({
      rating: 4,
      comment: "Thorough inspection.",
      ratedAt: ratedAt.toISOString(),
    });
  });
});
