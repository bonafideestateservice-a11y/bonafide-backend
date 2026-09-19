import { NextFunction, Request, Response } from "express";
import { ApiError, BadRequestError, HttpStatusCode } from "../../../../../exceptions";
import { CustomRequest } from "../../../../../middlewares/check-jwt";
import { createVerificationRequest } from "../../services/database/verification-request";
import { findVerificationType } from "../../services/database/verification-type";
import {
  validateVerificationDetails,
  VerificationRequestDetails,
} from "../../services/verification-details";
import { logger } from "../../../../../utils/logger";

export interface CreateVerificationRequestBody {
  verificationTypeId?: unknown;
  details?: VerificationRequestDetails;
  additionalNote?: unknown;
}

export const postVerificationRequest = async (
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

    const body = req.body as CreateVerificationRequestBody;
    if (typeof body?.verificationTypeId !== "string" || !body.verificationTypeId.trim()) {
      return next(new BadRequestError("Verification type is required."));
    }

    const verificationType = await findVerificationType({
      id: body.verificationTypeId.trim(),
    });
    if (!verificationType) {
      return next(new BadRequestError("Verification type not found."));
    }

    const validatedDetails = validateVerificationDetails(body.details, verificationType.slug, true);
    if (validatedDetails.error) {
      return next(new BadRequestError(validatedDetails.error));
    }

    if (body.additionalNote !== undefined && typeof body.additionalNote !== "string") {
      return next(new BadRequestError("Additional note must be a string."));
    }

    const verificationRequest = await createVerificationRequest({
      userId,
      verificationTypeId: body.verificationTypeId.trim(),
      status: "DRAFT",
      details: validatedDetails.details!,
      additionalNote:
        typeof body.additionalNote === "string" ? body.additionalNote.trim() || null : null,
    });

    res.status(HttpStatusCode.CREATED).json({
      id: verificationRequest.id,
      status: verificationRequest.status,
      verificationTypeId: verificationRequest.verificationTypeId,
      details: verificationRequest.details,
      additionalNote: verificationRequest.additionalNote,
      createdAt: verificationRequest.createdAt.toISOString(),
    });
  } catch (error) {
    logger.error(`Error creating verification request: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};
