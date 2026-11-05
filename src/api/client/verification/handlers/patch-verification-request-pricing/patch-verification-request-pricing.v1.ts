import { NextFunction, Request, Response } from "express";
import {
  ApiError,
  BadRequestError,
  ForbiddenError,
  HttpStatusCode,
  NotFoundError,
} from "../../../../../exceptions";
import { CustomRequest } from "../../../../../middlewares/check-jwt";
import { updateVerificationRequestPricing } from "../../../../services/database/pricing";
import { logger } from "../../../../../utils/logger";

interface PatchVerificationRequestPricingBody {
  verificationTierId?: unknown;
  monitoringPlanId?: unknown;
  recurringConsent?: unknown;
}

export const patchVerificationRequestPricing = async (
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
      return next(new BadRequestError("Verification request id is required."));
    }

    const body = req.body as PatchVerificationRequestPricingBody;
    const verificationTierId = typeof body?.verificationTierId === "string" ? body.verificationTierId.trim() : "";
    const monitoringPlanId =
      typeof body?.monitoringPlanId === "string" && body.monitoringPlanId.trim() ? body.monitoringPlanId.trim() : null;
    const recurringConsent = typeof body?.recurringConsent === "boolean" ? body.recurringConsent : false;

    if (!verificationTierId) {
      return next(new BadRequestError("Verification tier is required."));
    }

    const updatedRequest = await updateVerificationRequestPricing({
      requestId: verificationRequestId,
      userId,
      verificationTierId,
      monitoringPlanId,
      recurringConsent,
    });

    res.status(HttpStatusCode.OK).json({
      status: "success",
      message: "Verification request pricing updated successfully",
      data: {
        id: updatedRequest.id,
        status: updatedRequest.status,
        verificationTierId: updatedRequest.verificationTierId,
        monitoringPlanId: updatedRequest.monitoringPlanId,
        recurringConsent: updatedRequest.recurringConsent,
      },
    });
  } catch (error) {
    logger.error(`Error updating verification request pricing: ${error}`);

    if (error instanceof Error && error.name === "PricingRecordError") {
      const message = error.message || "Invalid pricing selection.";
      if (message.includes("not found")) {
        return next(new NotFoundError(message));
      }
      if (message.includes("cannot") || message.includes("does not support") || message.includes("required")) {
        return next(new BadRequestError(message));
      }
      return next(new ForbiddenError(message));
    }

    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};

export default patchVerificationRequestPricing;
