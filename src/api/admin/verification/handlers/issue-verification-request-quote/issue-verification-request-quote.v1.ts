import { NextFunction, Request, Response } from "express";
import {
  ApiError,
  BadRequestError,
  HttpStatusCode,
  NotFoundError,
} from "../../../../../exceptions";
import { CustomRequest } from "../../../../../middlewares/check-jwt";
import { prismaClient } from "../../../../../utils/prisma";
import { logger } from "../../../../../utils/logger";
import { issuePremiumQuote } from "../../../../services/database/pricing";
import { usdCentsToNgnKobo } from "../../../../services/pricing-calculation";
import { AppEventTypes } from "../../../../../events";
import { enqueueNotificationEvent } from "../../../../../jobs/notifications/queue";
import { premiumQuoteReviewUrl } from "../../../../../utils/client-links";

export const issueVerificationRequestQuote = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const customReq = req as CustomRequest;
    const adminId = customReq.user?.id ?? customReq.token?.id;
    const verificationRequestId = req.params.id?.trim();

    if (!adminId) {
      return next(new ApiError(HttpStatusCode.UNAUTHORIZED, "Authentication required."));
    }
    if (!verificationRequestId) {
      return next(new BadRequestError("Verification request id is required."));
    }

    const payload = req.body ?? {};
    const amountUsdCents =
      typeof payload.amountUsdCents === "number"
        ? payload.amountUsdCents
        : Number(payload.amountUsdCents);
    const expiresAt = payload.expiresAt ? new Date(payload.expiresAt) : null;
    const scopeSummary =
      typeof payload.scopeSummary === "string" ? payload.scopeSummary.trim() : "";

    if (!Number.isFinite(amountUsdCents) || amountUsdCents <= 0) {
      return next(new BadRequestError("A valid quote amount in USD cents is required."));
    }
    if (!expiresAt || Number.isNaN(expiresAt.getTime())) {
      return next(new BadRequestError("Quote expiry is required."));
    }

    const request = await prismaClient.verificationRequest.findUnique({
      where: { id: verificationRequestId },
      include: {
        premiumQuotes: true,
        verificationTier: true,
      },
    });
    if (!request) {
      return next(new NotFoundError("Verification request not found."));
    }

    const quote = await prismaClient.premiumQuote.findFirst({
      where: {
        verificationRequestId,
        status: { in: ["REQUESTED", "ISSUED"] },
      },
      orderBy: { createdAt: "desc" },
    });
    if (!quote) {
      return next(new NotFoundError("Premium quote request not found."));
    }
    const reviewUrl = premiumQuoteReviewUrl(verificationRequestId);

    const settings = await prismaClient.pricingSettings.findFirst({
      where: { active: true },
      orderBy: { version: "desc" },
    });
    if (!settings) {
      return next(
        new ApiError(HttpStatusCode.BAD_REQUEST, "No active pricing settings are configured."),
      );
    }

    const issued = await issuePremiumQuote({
      quoteId: quote.id,
      issuedById: adminId,
      quoteUsdCents: amountUsdCents,
      quoteNgnKobo: usdCentsToNgnKobo(amountUsdCents, settings.usdToNgnRate),
      usdToNgnRate: settings.usdToNgnRate.toString(),
      rateVersion: settings.version,
      pricingSettingsId: settings.id,
      expiresAt,
    });

    await enqueueNotificationEvent(AppEventTypes.PREMIUM_QUOTE_ISSUED, {
      quoteId: issued.id,
      reviewUrl,
    });

    res.status(HttpStatusCode.CREATED).json({
      id: issued.id,
      verificationRequestId: issued.verificationRequestId,
      status: issued.status,
      amountUsdCents: issued.quoteUsdCents,
      amountNgnKobo: issued.quoteNgnKobo,
      ngnConversionRate: issued.usdToNgnRate?.toString() ?? settings.usdToNgnRate.toString(),
      ngnRateVersion: issued.rateVersion ?? settings.version,
      scopeSummary: scopeSummary || request.verificationTier?.description || null,
      expiresAt: issued.expiresAt,
      issuedAt: issued.createdAt,
      notification: { emailStatus: "QUEUED" },
    });
  } catch (error) {
    logger.error(`Error issuing Premium quote requestId=${req.params.id}: ${error}`);
    if (error instanceof Error && error.name === "PricingRecordError") {
      const message = error.message || "Premium quote could not be issued.";
      if (message.toLowerCase().includes("not found")) {
        return next(new NotFoundError(message));
      }
      if (
        message.toLowerCase().includes("outside") ||
        message.toLowerCase().includes("invalid") ||
        message.toLowerCase().includes("expiry")
      ) {
        return next(new BadRequestError(message));
      }
      return next(new ApiError(HttpStatusCode.CONFLICT, message));
    }
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};

export default issueVerificationRequestQuote;
