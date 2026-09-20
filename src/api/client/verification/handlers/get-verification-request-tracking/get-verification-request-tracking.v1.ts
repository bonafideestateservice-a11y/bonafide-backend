import { NextFunction, Request, Response } from "express";
import { ApiError, HttpStatusCode, NotFoundError } from "../../../../../exceptions";
import { CustomRequest } from "../../../../../middlewares/check-jwt";
import { getVerificationRequestTrackingForUser } from "../../services/database/verification-request";
import { logger } from "../../../../../utils/logger";

export const getVerificationRequestTracking = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const customReq = req as CustomRequest;
    const userId = customReq.user?.id ?? customReq.token?.id;

    if (!userId) {
      return next(new ApiError(HttpStatusCode.UNAUTHORIZED, "Authentication required."));
    }

    const verificationRequestId = req.params.id;
    if (!verificationRequestId?.trim()) {
      return next(new NotFoundError("Verification request not found."));
    }

    const tracking = await getVerificationRequestTrackingForUser(
      verificationRequestId,
      userId,
    );

    if (!tracking) {
      return next(new NotFoundError("Verification request not found."));
    }

    let progressPercent = 0;
    let inspectionUploads: Array<{ url: string; label: string }> = [];

    if (tracking.agentAssignment) {
      const items = tracking.agentAssignment.checklistItems;
      if (items && items.length > 0) {
        const completed = items.filter((item) => item.status === "COMPLETE").length;
        progressPercent = Math.round((completed / items.length) * 100);

        items.forEach((item) => {
          item.media.forEach((media) => {
            inspectionUploads.push({
              url: media.url,
              label: media.fileName,
            });
          });
        });
      } else {
        progressPercent = tracking.agentAssignment.progressPercent || 0;
      }
    }

    let agentData = null;
    if (tracking.agentAssignment?.agent) {
      const agentNameParts = tracking.agentAssignment.agent.name.split(" ");
      const firstName = agentNameParts[0] || "";
      const lastName = agentNameParts.slice(1).join(" ") || "";
      
      agentData = {
        firstName,
        lastName,
        isVerified: true,
        photoUrl: tracking.agentAssignment.agent.user.profilePhoto,
      };
    }

    let propertyAddress = "Address not provided";
    if (tracking.details && typeof tracking.details === "object" && !Array.isArray(tracking.details)) {
      propertyAddress = (tracking.details as any).propertyAddress || propertyAddress;
    }

    const responsePayload = {
      id: tracking.id,
      verificationType: { name: tracking.verificationType.name },
      address: propertyAddress,
      progressPercent,
      timeline: {
        requestSubmittedAt: tracking.createdAt.toISOString(),
        agentAssignedAt: tracking.agentAssignment?.createdAt.toISOString() || null,
        inspectionStartedAt: tracking.agentAssignment?.scheduledAt?.toISOString() || null,
        inspectionCompletedAt: tracking.agentAssignment?.completedAt?.toISOString() || null,
        reportReadyAt: tracking.report?.generatedAt?.toISOString() || null,
      },
      agent: agentData,
      inspectionUploads,
      notificationPreferences: {
        notifyOnInspectionStart: tracking.notifyOnInspectionStart,
        notifyOnReportReady: tracking.notifyOnReportReady,
      },
    };

    res.status(HttpStatusCode.OK).json({
      status: "success",
      message: "Tracking information retrieved successfully",
      data: responsePayload,
    });
  } catch (error) {
    logger.error(`Error in getVerificationRequestTracking handler: ${error}`);
    next(error);
  }
};
