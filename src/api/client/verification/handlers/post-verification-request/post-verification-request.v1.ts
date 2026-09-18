import { NextFunction, Request, Response } from "express";
import {
  ApiError,
  BadRequestError,
  HttpStatusCode,
} from "../../../../../exceptions";
import { CustomRequest } from "../../../../../middlewares/check-jwt";
import { createVerificationRequest } from "../../services/database/verification-request";
import { logger } from "../../../../../utils/logger";

interface CreateVerificationRequestBody {
  verificationTypeId?: unknown;
  details?: {
    propertyName?: unknown;
    propertyType?: unknown;
    propertyAddress?: unknown;
  };
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
      return next(
        new ApiError(HttpStatusCode.UNAUTHORIZED, "Authentication required."),
      );
    }

    const body = req.body as CreateVerificationRequestBody;
    const details = body?.details;

    if (
      typeof body?.verificationTypeId !== "string" ||
      !body.verificationTypeId.trim()
    ) {
      return next(new BadRequestError("Verification type is required."));
    }

    if (
      !details ||
      typeof details.propertyType !== "string" ||
      !details.propertyType.trim() ||
      typeof details.propertyAddress !== "string" ||
      !details.propertyAddress.trim()
    ) {
      return next(
        new BadRequestError("Property type and property address are required."),
      );
    }

    if (
      details.propertyName !== undefined &&
      (typeof details.propertyName !== "string" || !details.propertyName.trim())
    ) {
      return next(
        new BadRequestError("Property name must be a non-empty string."),
      );
    }

    if (
      body.additionalNote !== undefined &&
      typeof body.additionalNote !== "string"
    ) {
      return next(new BadRequestError("Additional note must be a string."));
    }

    const verificationRequest = await createVerificationRequest({
      userId,
      verificationTypeId: body.verificationTypeId.trim(),
      status: "DRAFT",
      details: {
        ...(details.propertyName !== undefined
          ? { propertyName: details.propertyName.trim() }
          : {}),
        propertyType: details.propertyType.trim(),
        propertyAddress: details.propertyAddress.trim(),
      },
      additionalNote:
        typeof body.additionalNote === "string"
          ? body.additionalNote.trim() || null
          : null,
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
    next(
      new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."),
    );
  }
};
