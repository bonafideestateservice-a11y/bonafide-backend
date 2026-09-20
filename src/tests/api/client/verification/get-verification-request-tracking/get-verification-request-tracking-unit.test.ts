import { Request, Response, NextFunction } from "express";
import { getVerificationRequestTracking } from "../../../../../api/client/verification/handlers/get-verification-request-tracking";
import * as databaseService from "../../../../../api/client/verification/services/database/verification-request";
import { ApiError, HttpStatusCode, NotFoundError } from "../../../../../exceptions";
import { CustomRequest } from "../../../../../middlewares/check-jwt";

jest.mock("../../../../../api/client/verification/services/database/verification-request");

describe("GET /verification-requests/:id/tracking - Unit", () => {
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
    await getVerificationRequestTracking(req as Request, res as Response, next);
    expect(next).toHaveBeenCalledWith(expect.any(ApiError));
    expect(next.mock.calls[0][0].statusCode).toBe(HttpStatusCode.UNAUTHORIZED);
  });

  it("should return 404 if request ID is missing", async () => {
    req.params = { id: "   " };
    await getVerificationRequestTracking(req as Request, res as Response, next);
    expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
  });

  it("should return 404 if request is not found", async () => {
    (databaseService.getVerificationRequestTrackingForUser as jest.Mock).mockResolvedValue(null);
    await getVerificationRequestTracking(req as Request, res as Response, next);
    expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
  });

  it("should return tracking details successfully", async () => {
    const mockTracking = {
      id: "req-123",
      details: { propertyAddress: "123 Main St" },
      createdAt: new Date("2023-12-14T15:39:00Z"),
      notifyOnInspectionStart: true,
      notifyOnReportReady: true,
      verificationType: { name: "Property Verification" },
      agentAssignment: {
        status: "INSPECTION_SCHEDULED",
        createdAt: new Date("2023-12-15T09:12:00Z"),
        scheduledAt: new Date("2023-12-16T10:00:00Z"),
        completedAt: null,
        progressPercent: 10,
        checklistItems: [
          { status: "COMPLETE", media: [{ url: "http://example.com/photo1.jpg", fileName: "photo1.jpg" }] },
          { status: "PENDING", media: [] }
        ],
        agent: {
          name: "John Doe",
          user: { profilePhoto: "http://example.com/john.jpg" }
        }
      },
      report: null
    };

    (databaseService.getVerificationRequestTrackingForUser as jest.Mock).mockResolvedValue(mockTracking);

    await getVerificationRequestTracking(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(HttpStatusCode.OK);
    expect(res.json).toHaveBeenCalledWith({
      status: "success",
      message: "Tracking information retrieved successfully",
      data: expect.objectContaining({
        id: "req-123",
        verificationType: { name: "Property Verification" },
        address: "123 Main St",
        progressPercent: 50, // 1/2 complete
        timeline: {
          requestSubmittedAt: "2023-12-14T15:39:00.000Z",
          agentAssignedAt: "2023-12-15T09:12:00.000Z",
          inspectionStartedAt: "2023-12-16T10:00:00.000Z",
          inspectionCompletedAt: null,
          reportReadyAt: null,
        },
        agent: {
          firstName: "John",
          lastName: "Doe",
          isVerified: true,
          photoUrl: "http://example.com/john.jpg"
        },
        inspectionUploads: [
          { url: "http://example.com/photo1.jpg", label: "photo1.jpg" }
        ],
        notificationPreferences: {
          notifyOnInspectionStart: true,
          notifyOnReportReady: true
        }
      })
    });
  });
});
