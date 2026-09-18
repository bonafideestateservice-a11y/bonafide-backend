import { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
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
import { logger } from "../../../../../utils/logger";

type PatchVerificationRequestBody = Omit<
  CreateVerificationRequestBody,
  "verificationTypeId"
>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const validateDetails = (
  details: Record<string, unknown>,
): string | undefined => {
  for (const field of ["propertyName", "propertyType", "propertyAddress"]) {
    if (details[field] !== undefined) {
      if (typeof details[field] !== "string" || !details[field].trim()) {
        return `${field} must be a non-empty string.`;
      }
    }
  }

  return undefined;
};

export const patchVerificationRequest = async (
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

    const verificationRequestId = req.params.id;
    if (!verificationRequestId?.trim()) {
      return next(new BadRequestError("Verification request id is required."));
    }

    const body = req.body as PatchVerificationRequestBody;
    const hasDetails = body?.details !== undefined;
    const hasAdditionalNote = body?.additionalNote !== undefined;

    if (!hasDetails && !hasAdditionalNote) {
      return next(
        new BadRequestError(
          "At least one of details or additionalNote is required.",
        ),
      );
    }

    let details: Record<string, unknown> | undefined;
    if (hasDetails) {
      const suppliedDetails = body.details;
      if (!isRecord(suppliedDetails)) {
        return next(new BadRequestError("Details must be an object."));
      }

      const detailsError = validateDetails(suppliedDetails);
      if (detailsError) {
        return next(new BadRequestError(detailsError));
      }

      const detailFields = [
        "propertyName",
        "propertyType",
        "propertyAddress",
      ] as const;
      details = Object.fromEntries(
        detailFields
          .filter((field) => suppliedDetails[field] !== undefined)
          .map((field) => [
            field,
            typeof suppliedDetails[field] === "string"
              ? suppliedDetails[field].trim()
              : suppliedDetails[field],
          ]),
      );
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

    const existingDetails = isRecord(verificationRequest.details)
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
              } as Prisma.InputJsonObject,
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
    next(
      new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."),
    );
  }
};

export default patchVerificationRequest;
