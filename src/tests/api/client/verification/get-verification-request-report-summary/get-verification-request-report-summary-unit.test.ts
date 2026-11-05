import { Request, Response } from "express";
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
      token: { id: "user-123" },
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
    (databaseService.getVerificationRequestReportSummaryForUser as jest.Mock).mockResolvedValue(
      null,
    );
    await getVerificationRequestReportSummary(req as Request, res as Response, next);
    expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
  });

  it("should return report summary details successfully", async () => {
    const mockSummary = {
      details: { propertyAddress: "123 Main St", propertyName: "Test Prop" },
      reports: [
        {
          generatedAt: new Date("2023-12-16T10:00:00Z"),
          findings: [{ label: "Ownership", value: "Verified", status: "good" }],
          agent: { name: "John Doe" },
          checklistItems: [
            { sortOrder: 0, status: "COMPLETE", media: [{ url: "http://example.com/photo1.jpg" }] },
            { sortOrder: 1, status: "PENDING", media: [{ url: "http://example.com/photo2.jpg" }] },
          ],
          media: [],
        },
      ],
      agentAssignment: null,
      verificationPlan: {
        name: "Standard Plan",
      },
    };

    (databaseService.getVerificationRequestReportSummaryForUser as jest.Mock).mockResolvedValue(
      mockSummary,
    );

    await getVerificationRequestReportSummary(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(HttpStatusCode.OK);
    expect(res.json).toHaveBeenCalledWith({
      status: "success",
      message: "Report summary retrieved successfully",
      data: {
        property: "Test Prop",
        inspectionDate: "2023-12-16T10:00:00.000Z",
        location: "123 Main St",
        reportType: "Standard Plan",
        insights: [{ label: "Ownership", value: "Verified", status: "good" }],
        findings: [{ label: "Ownership", value: "Verified", status: "good" }],
        verificationTier: null,
        subscriptionPeriod: null,
        providerName: "Bonafide",
        checklist: [
          { label: "Physical verification", status: "COMPLETE" },
          { label: "Court/crime verification", status: "PENDING" },
          { label: "Title deeds and documentation verification", status: null },
          { label: "Valuation verification", status: null },
          { label: "Amenities and environment verification", status: null },
        ],
        reportDocument: null,
        mediaPreview: [
          { url: "http://example.com/photo1.jpg" },
          { url: "http://example.com/photo2.jpg" },
        ],
      },
    });
  });

  it("returns tiered findings and Bonafide attribution without agent identity", async () => {
    (databaseService.getVerificationRequestReportSummaryForUser as jest.Mock).mockResolvedValue({
      details: { propertyAddress: "12 Example Road", propertyName: "Premium Property" },
      reports: [
        {
          generatedAt: new Date("2026-11-05T10:00:00Z"),
          findings: {
            tier: { id: "private-tier-id", code: "PREMIUM", name: "Premium" },
            period: {
              periodStart: "2026-11-01T00:00:00.000Z",
              periodEnd: "2026-12-01T00:00:00.000Z",
              requiredSiteVisits: 2,
              completedSiteVisits: 2,
            },
            sections: [
              {
                key: "valuation",
                result: { amount: 85000000, currency: "NGN", basis: "Comparable local sales" },
              },
            ],
          },
          tierNameSnapshot: "Premium",
          packageScopeSnapshot: {
            tier: { id: "private-tier-id", code: "PREMIUM", name: "Premium" },
            period: {
              periodStart: "2026-11-01T00:00:00.000Z",
              periodEnd: "2026-12-01T00:00:00.000Z",
              requiredSiteVisits: 2,
              completedSiteVisits: 2,
            },
          },
          agent: { name: "Private Agent Name" },
          checklistItems: [
            {
              label: "Property valuation",
              status: "COMPLETE",
              sortOrder: 0,
              sectionKey: "valuation",
              result: { amount: 85000000, currency: "NGN", basis: "Comparable local sales" },
              media: [{ url: "https://cdn.test/valuation.pdf", fileName: "valuation.pdf" }],
            },
          ],
          media: [],
        },
      ],
      agentAssignment: null,
      verificationPlan: { name: "Legacy Plan" },
    });

    await getVerificationRequestReportSummary(req as Request, res as Response, next);

    const data = (res.json as jest.Mock).mock.calls[0][0].data;
    expect(data).toMatchObject({
      reportType: "Premium",
      providerName: "Bonafide",
      verificationTier: { code: "PREMIUM", name: "Premium" },
      subscriptionPeriod: {
        startsAt: "2026-11-01T00:00:00.000Z",
        endsAt: "2026-12-01T00:00:00.000Z",
        checksIncluded: 2,
        checksCompleted: 2,
      },
      findings: {
        valuation: { amount: 85000000, currency: "NGN", basis: "Comparable local sales" },
      },
      checklist: [
        {
          sectionKey: "valuation",
          result: { amount: 85000000, currency: "NGN", basis: "Comparable local sales" },
        },
      ],
      mediaPreview: [{ url: "https://cdn.test/valuation.pdf" }],
    });
    expect(data).not.toHaveProperty("agent");
    expect(JSON.stringify(data)).not.toContain("Private Agent Name");
  });
});
