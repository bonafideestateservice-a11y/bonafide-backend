import { NextFunction, Request, Response } from "express";
import {
  ApiError,
  BadRequestError,
  HttpStatusCode,
} from "../../../../../exceptions";
import { CustomRequest } from "../../../../../middlewares/check-jwt";
import {
  getVerificationRequestsForUser,
  VerificationRequestSummary,
} from "../../services/database/verification-request";
import { logger } from "../../../../../utils/logger";

const getPropertyName = (
  details: VerificationRequestSummary["details"],
): string => {
  if (
    typeof details === "object" &&
    details !== null &&
    !Array.isArray(details)
  ) {
    const propertyName = (details as Record<string, unknown>).propertyName;
    if (typeof propertyName === "string" && propertyName.trim()) {
      return propertyName;
    }
  }

  return "Verification request";
};

export const getVerificationRequests = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const customReq = req as CustomRequest;
    const userId = customReq.user?.id ?? customReq.token?.id;

    if (!userId) {
      return next(
        new ApiError(HttpStatusCode.UNAUTHORIZED, "Authentication required."),
      );
    }

    const limitParam = req.query.limit;
    const limit = limitParam === undefined ? 5 : Number(limitParam);

    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
      return next(
        new BadRequestError("Limit must be an integer between 1 and 50."),
      );
    }

    const verificationRequests = await getVerificationRequestsForUser(
      userId,
      limit,
    );

    res.status(HttpStatusCode.OK).json(
      verificationRequests.map((verificationRequest) => ({
        id: verificationRequest.id,
        title: getPropertyName(verificationRequest.details),
        verificationType: verificationRequest.verificationType,
        status: verificationRequest.status,
        updatedAt: verificationRequest.updatedAt.toISOString(),
      })),
    );
  } catch (error) {
    logger.error(`Error getting verification requests: ${error}`);
    next(
      new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."),
    );
  }
};
