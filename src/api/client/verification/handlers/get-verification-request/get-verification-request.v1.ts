import { NextFunction, Request, Response } from "express";
import { ApiError, HttpStatusCode, NotFoundError } from "../../../../../exceptions";
import { CustomRequest } from "../../../../../middlewares/check-jwt";
import { getVerificationRequestDetailsForUser } from "../../services/database/verification-request";
import { logger } from "../../../../../utils/logger";

export const getVerificationRequest = async (
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

    const verificationRequest = await getVerificationRequestDetailsForUser(
      verificationRequestId,
      userId,
    );

    if (!verificationRequest) {
      return next(new NotFoundError("Verification request not found."));
    }

    if (!verificationRequest.verificationPlan) {
      return next(new NotFoundError("Verification plan not selected."));
    }

    res.status(HttpStatusCode.OK).json({
      id: verificationRequest.id,
      status: verificationRequest.status,
      verificationType: verificationRequest.verificationType,
      details: verificationRequest.details,
      plan: verificationRequest.verificationPlan,
      createdAt: verificationRequest.createdAt.toISOString(),
    });
  } catch (error) {
    logger.error(`Error getting verification request: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};

export default getVerificationRequest;
