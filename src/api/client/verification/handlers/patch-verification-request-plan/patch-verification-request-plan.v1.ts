import { NextFunction, Request, Response } from "express";
import {
  ApiError,
  BadRequestError,
  ForbiddenError,
  HttpStatusCode,
  NotFoundError,
} from "../../../../../exceptions";
import { CustomRequest } from "../../../../../middlewares/check-jwt";
import { findVerificationPlan } from "../../services/database/verification-plan";
import {
  findVerificationRequest,
  updateVerificationRequest,
} from "../../services/database/verification-request";
import { logger } from "../../../../../utils/logger";

interface PatchVerificationRequestPlanBody {
  verificationPlanId?: unknown;
}

export const patchVerificationRequestPlan = async (
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

    const body = req.body as PatchVerificationRequestPlanBody;
    if (typeof body?.verificationPlanId !== "string" || !body.verificationPlanId.trim()) {
      return next(new BadRequestError("Verification plan is required."));
    }

    const verificationRequest = await findVerificationRequest({
      id: verificationRequestId,
    });

    if (!verificationRequest) {
      return next(new NotFoundError("Verification request not found."));
    }

    if (verificationRequest.userId !== userId) {
      return next(new ForbiddenError("You cannot update this request."));
    }

    const verificationPlan = await findVerificationPlan({
      id: body.verificationPlanId.trim(),
    });

    if (!verificationPlan) {
      return next(new NotFoundError("Verification plan not found."));
    }

    if (verificationPlan.verificationTypeId !== verificationRequest.verificationTypeId) {
      return next(
        new BadRequestError("Verification plan does not belong to this verification type."),
      );
    }

    const updatedRequest = await updateVerificationRequest(
      { id: verificationRequestId },
      { verificationPlanId: verificationPlan.id },
    );

    res.status(HttpStatusCode.OK).json({
      id: updatedRequest.id,
      status: updatedRequest.status,
      verificationPlanId: updatedRequest.verificationPlanId,
      plan: {
        frequency: verificationPlan.frequency,
        name: verificationPlan.name,
        priceInCents: verificationPlan.priceInCents,
        currency: verificationPlan.currency,
      },
    });
  } catch (error) {
    logger.error(`Error updating verification request plan: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};

export default patchVerificationRequestPlan;
