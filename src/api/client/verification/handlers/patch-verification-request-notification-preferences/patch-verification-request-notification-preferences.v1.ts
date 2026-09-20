import { NextFunction, Request, Response } from "express";
import { ApiError, HttpStatusCode, NotFoundError, BadRequestError } from "../../../../../exceptions";
import { CustomRequest } from "../../../../../middlewares/check-jwt";
import { findVerificationRequest, updateVerificationRequest } from "../../services/database/verification-request";
import { logger } from "../../../../../utils/logger";

export const patchVerificationRequestNotificationPreferences = async (
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

    const requestExists = await findVerificationRequest({ id: verificationRequestId });
    if (!requestExists || requestExists.userId !== userId) {
      return next(new NotFoundError("Verification request not found."));
    }

    const { notifyOnInspectionStart, notifyOnReportReady } = req.body;

    if (typeof notifyOnInspectionStart !== "boolean" && typeof notifyOnReportReady !== "boolean") {
      return next(new BadRequestError("At least one notification preference must be provided as a boolean."));
    }

    const dataToUpdate: any = {};
    if (typeof notifyOnInspectionStart === "boolean") {
      dataToUpdate.notifyOnInspectionStart = notifyOnInspectionStart;
    }
    if (typeof notifyOnReportReady === "boolean") {
      dataToUpdate.notifyOnReportReady = notifyOnReportReady;
    }

    const updated = await updateVerificationRequest(
      { id: verificationRequestId },
      dataToUpdate
    );

    res.status(HttpStatusCode.OK).json({
      status: "success",
      message: "Notification preferences updated successfully",
      data: {
        notifyOnInspectionStart: updated.notifyOnInspectionStart,
        notifyOnReportReady: updated.notifyOnReportReady,
      },
    });
  } catch (error) {
    logger.error(`Error in patchVerificationRequestNotificationPreferences handler: ${error}`);
    next(error);
  }
};
