import { NextFunction, Request, Response } from "express";
import {
  ApiError,
  BadRequestError,
  ForbiddenError,
  HttpStatusCode,
  NotFoundError,
} from "../../../../../exceptions";
import { CustomRequest } from "../../../../../middlewares/check-jwt";
import { createPremiumQuoteRequest } from "../../../../services/database/pricing";
import { prismaClient } from "../../../../../utils/prisma";
import { logger } from "../../../../../utils/logger";
import { VerificationTierCode } from "@prisma/client";

export const postVerificationRequestQuote = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const customReq = req as CustomRequest;
    const userId = customReq.user?.id ?? customReq.token?.id;
    const verificationRequestId = req.params.id?.trim();

    if (!userId) {
      return next(new ApiError(HttpStatusCode.UNAUTHORIZED, "Authentication required."));
    }
    if (!verificationRequestId) {
      return next(new BadRequestError("Verification request id is required."));
    }

    const request = await prismaClient.verificationRequest.findFirst({
      where: {
        id: verificationRequestId,
        userId,
      },
      include: {
        verificationTier: true,
      },
    });

    if (!request) {
      return next(new NotFoundError("Verification request not found."));
    }
    if (!request.verificationTierId) {
      return next(
        new BadRequestError("Select a verification tier before requesting a Premium quote."),
      );
    }
    if (request.verificationTier?.code !== VerificationTierCode.PREMIUM) {
      return next(
        new BadRequestError("Premium quote requests are only available for Premium quotes."),
      );
    }

    const body = req.body ?? {};
    if (body.intendedUse !== undefined && typeof body.intendedUse !== "string") {
      return next(new BadRequestError("Intended use must be a string."));
    }
    if (body.notes !== undefined && typeof body.notes !== "string") {
      return next(new BadRequestError("Notes must be a string."));
    }

    const intendedUse =
      typeof body.intendedUse === "string" ? body.intendedUse.trim() : request.intendedUse?.trim();
    if (!intendedUse) {
      return next(new BadRequestError("Intended use is required for a Premium quote request."));
    }

    const notes = typeof body.notes === "string" ? body.notes.trim() || null : undefined;
    const quote = await createPremiumQuoteRequest({
      verificationRequestId,
      verificationTierId: request.verificationTierId,
      userId,
      intendedUse,
      ...(notes !== undefined ? { notes } : {}),
    });

    res.status(HttpStatusCode.CREATED).json({
      id: quote.id,
      verificationRequestId: quote.verificationRequestId,
      status: quote.status,
      submittedAt: quote.createdAt,
    });
  } catch (error) {
    logger.error(`Error creating Premium quote request requestId=${req.params.id}: ${error}`);
    if (error instanceof Error && error.name === "PricingRecordError") {
      const message = error.message || "Premium quote request is unavailable.";
      if (message.toLowerCase().includes("not found")) {
        return next(new NotFoundError(message));
      }
      if (
        message.toLowerCase().includes("already") ||
        message.toLowerCase().includes("is not available")
      ) {
        return next(new ForbiddenError(message));
      }
      return next(new BadRequestError(message));
    }
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};

export default postVerificationRequestQuote;
