import { NextFunction, Request, Response } from "express";
import {
  ApiError,
  BadRequestError,
  ForbiddenError,
  HttpStatusCode,
  NotFoundError,
} from "../../../../../exceptions";
import { CustomRequest } from "../../../../../middlewares/check-jwt";
import type { CreateVerificationRequestBody } from "../post-verification-request/post-verification-request.v1";
import {
  findVerificationRequest,
  updateVerificationRequest,
} from "../../services/database/verification-request";
import { findVerificationType } from "../../services/database/verification-type";
import {
  isVerificationDetailsRecord,
  validateVerificationDetails,
} from "../../services/verification-details";
import { logger } from "../../../../../utils/logger";

type PatchVerificationRequestBody = Omit<CreateVerificationRequestBody, "verificationTypeId">;

export const patchVerificationRequest = async (
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

    const body = req.body as PatchVerificationRequestBody;
    const hasDetails = body?.details !== undefined;
    const hasAdditionalNote = body?.additionalNote !== undefined;

    if (!hasDetails && !hasAdditionalNote) {
      return next(new BadRequestError("At least one of details or additionalNote is required."));
    }

    let details;
    if (hasDetails) {
      if (!isVerificationDetailsRecord(body.details)) {
        return next(new BadRequestError("Details must be an object."));
      }
    }

    if (hasAdditionalNote && typeof body.additionalNote !== "string") {
      return next(new BadRequestError("Additional note must be a string."));
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

    if (hasDetails) {
      const verificationType = await findVerificationType({
        id: verificationRequest.verificationTypeId,
      });
      if (!verificationType) {
        return next(new NotFoundError("Verification type not found."));
      }

      const validatedDetails = validateVerificationDetails(
        body.details,
        verificationType.slug,
        false,
      );
      if (validatedDetails.error) {
        return next(new BadRequestError(validatedDetails.error));
      }
      details = validatedDetails.details;
    }

    const existingDetails = isVerificationDetailsRecord(verificationRequest.details)
      ? verificationRequest.details
      : {};
    const updated = await updateVerificationRequest(
      { id: verificationRequestId },
      {
        ...(details
          ? {
              details: {
                ...existingDetails,
                ...details,
              },
            }
          : {}),
        ...(hasAdditionalNote
          ? {
              additionalNote: (body.additionalNote as string).trim() || null,
            }
          : {}),
      },
    );

    res.status(HttpStatusCode.OK).json(updated);
  } catch (error) {
    logger.error(`Error updating verification request: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};

export default patchVerificationRequest;
