import { NextFunction, Request, Response } from "express";
import {
  ApiError,
  BadRequestError,
  HttpStatusCode,
  NotFoundError,
} from "../../../../../exceptions";
import { CustomRequest } from "../../../../../middlewares/check-jwt";
import {
  acceptPremiumQuote,
  findPremiumQuoteForUser,
  PricingRecordError,
} from "../../../../services/database/pricing";
import { prismaClient } from "../../../../../utils/prisma";
import { logger } from "../../../../../utils/logger";
import {
  createPaystackVerificationCheckout,
  createStripeVerificationCheckout,
} from "../../services/verification-checkout";
import { AppEventTypes } from "../../../../../events";
import { enqueueNotificationEvent } from "../../../../../jobs/notifications/queue";

const resolvePayment = async (verificationRequestId: string) => {
  const request = await prismaClient.verificationRequest.findUnique({
    where: { id: verificationRequestId },
    include: {
      user: true,
    },
  });

  if (!request) {
    throw new NotFoundError("Verification request not found.");
  }

  const countryCode = request.user.countryCode?.toUpperCase();
  if (!countryCode) {
    throw new BadRequestError("Set a country on your profile before accepting a quote.");
  }
  const checkout =
    countryCode === "NG"
      ? await createPaystackVerificationCheckout(verificationRequestId, request.userId)
      : await createStripeVerificationCheckout(verificationRequestId, request.userId);
  const pricing = checkout.pricing;
  const quoteAmountMinor =
    pricing.currency === "NGN"
      ? pricing.verificationAmountNgnKobo
      : pricing.verificationAmountUsdCents;
  if (quoteAmountMinor === null) {
    throw new Error(`Quote amount is unavailable for requestId=${verificationRequestId}`);
  }

  return {
    provider: checkout.provider,
    currency: pricing.currency,
    checkoutUrl: checkout.checkoutUrl,
    checkoutExpiresAt: null,
    reference: checkout.reference,
    transactionId: checkout.transactionId,
    status: "PENDING",
    quoteAmountMinor,
    monitoringPlanName: pricing.request.monitoringPlan?.name ?? null,
    monitoringAmountMinor:
      pricing.currency === "NGN"
        ? pricing.monitoringAmountNgnKobo
        : pricing.monitoringAmountUsdCents,
    totalAmountMinor: pricing.amountMinor,
  };
};

export const acceptVerificationRequestQuote = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const customReq = req as CustomRequest;
    const userId = customReq.user?.id ?? customReq.token?.id;
    const verificationRequestId = req.params.id?.trim();
    const quoteId = typeof req.body?.quoteId === "string" ? req.body.quoteId.trim() : "";

    if (!userId) {
      return next(new ApiError(HttpStatusCode.UNAUTHORIZED, "Authentication required."));
    }
    if (!verificationRequestId) {
      return next(new BadRequestError("Verification request id is required."));
    }
    if (!quoteId) {
      return next(new BadRequestError("Quote id is required."));
    }

    const quote = await findPremiumQuoteForUser(verificationRequestId, userId);
    if (!quote) {
      return next(new NotFoundError("Premium quote not found."));
    }
    if (quote.id !== quoteId) {
      return next(new BadRequestError("Quote does not belong to this verification request."));
    }

    const accepted = await acceptPremiumQuote({ quoteId: quote.id, userId });

    const payment = await resolvePayment(verificationRequestId);
    await enqueueNotificationEvent(AppEventTypes.PREMIUM_QUOTE_ACCEPTED, {
      quoteId: accepted.quote.id,
      provider: payment.provider,
      currency: payment.currency,
      checkoutUrl: payment.checkoutUrl,
      quoteAmountMinor: payment.quoteAmountMinor,
      monitoringPlanName: payment.monitoringPlanName,
      monitoringAmountMinor: payment.monitoringAmountMinor,
      totalAmountMinor: payment.totalAmountMinor,
    });
    const response = {
      id: accepted.quote.id,
      status: accepted.quote.status,
      amountUsdCents: quote.quoteUsdCents ?? null,
      amountNgnKobo: quote.quoteNgnKobo ?? null,
      ngnConversionRate: quote.usdToNgnRate?.toString() ?? null,
      ngnRateVersion: quote.rateVersion ?? null,
      acceptedAt: accepted.quote.acceptedAt,
      expiresAt: quote.expiresAt,
      payment: {
        provider: payment.provider,
        currency: payment.currency,
        checkoutUrl: payment.checkoutUrl,
        checkoutExpiresAt: payment.checkoutExpiresAt,
        reference: payment.reference,
        transactionId: payment.transactionId,
        status: payment.status,
      },
      notification: { emailStatus: "QUEUED" },
    };

    res.status(HttpStatusCode.OK).json(response);
  } catch (error) {
    logger.error(`Error accepting Premium quote requestId=${req.params.id}: ${error}`);
    if (error instanceof ApiError) {
      return next(error);
    }
    if (error instanceof PricingRecordError) {
      const message = error.message || "Premium quote could not be accepted.";
      if (message.toLowerCase().includes("not found")) {
        return next(new NotFoundError(message));
      }
      if (
        message.toLowerCase().includes("expired") ||
        message.toLowerCase().includes("not available")
      ) {
        return next(new BadRequestError(message));
      }
      return next(new ApiError(HttpStatusCode.CONFLICT, message));
    }
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};

export default acceptVerificationRequestQuote;
