import { Request, Response, NextFunction } from "express";
import { patchVerificationRequestNotificationPreferences } from "../../../../../api/client/verification/handlers/patch-verification-request-notification-preferences";
import * as databaseService from "../../../../../api/client/verification/services/database/verification-request";
import { ApiError, HttpStatusCode, NotFoundError, BadRequestError } from "../../../../../exceptions";
import { CustomRequest } from "../../../../../middlewares/check-jwt";

jest.mock("../../../../../api/client/verification/services/database/verification-request");

describe("PATCH /verification-requests/:id/notification-preferences - Unit", () => {
  let req: Partial<CustomRequest>;
  let res: Partial<Response>;
  let next: jest.Mock;

  beforeEach(() => {
    req = {
      params: { id: "req-123" },
      user: { id: "user-123" } as any,
      body: {}
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
    await patchVerificationRequestNotificationPreferences(req as Request, res as Response, next);
    expect(next).toHaveBeenCalledWith(expect.any(ApiError));
    expect(next.mock.calls[0][0].statusCode).toBe(HttpStatusCode.UNAUTHORIZED);
  });

  it("should return 404 if request ID is missing", async () => {
    req.params = { id: "   " };
    await patchVerificationRequestNotificationPreferences(req as Request, res as Response, next);
    expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
  });

  it("should return 404 if request is not found", async () => {
    (databaseService.findVerificationRequest as jest.Mock).mockResolvedValue(null);
    await patchVerificationRequestNotificationPreferences(req as Request, res as Response, next);
    expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
  });

  it("should return 400 if no valid boolean is provided", async () => {
    (databaseService.findVerificationRequest as jest.Mock).mockResolvedValue({ id: "req-123", userId: "user-123" });
    req.body = { notifyOnInspectionStart: "yes" }; // invalid type
    await patchVerificationRequestNotificationPreferences(req as Request, res as Response, next);
    expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
  });

  it("should update preferences successfully", async () => {
    (databaseService.findVerificationRequest as jest.Mock).mockResolvedValue({ id: "req-123", userId: "user-123" });
    
    req.body = { notifyOnInspectionStart: false, notifyOnReportReady: true };
    
    (databaseService.updateVerificationRequest as jest.Mock).mockResolvedValue({
      id: "req-123",
      notifyOnInspectionStart: false,
      notifyOnReportReady: true
    });

    await patchVerificationRequestNotificationPreferences(req as Request, res as Response, next);

    expect(databaseService.updateVerificationRequest).toHaveBeenCalledWith(
      { id: "req-123" },
      { notifyOnInspectionStart: false, notifyOnReportReady: true }
    );
    expect(res.status).toHaveBeenCalledWith(HttpStatusCode.OK);
    expect(res.json).toHaveBeenCalledWith({
      status: "success",
      message: "Notification preferences updated successfully",
      data: {
        notifyOnInspectionStart: false,
        notifyOnReportReady: true
      }
    });
  });
});
