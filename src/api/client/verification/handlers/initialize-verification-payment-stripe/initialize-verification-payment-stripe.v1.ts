import { VerificationStatus } from "@prisma/client";
import { NextFunction, Request, Response } from "express";
import {
  ApiError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  HttpStatusCode,
  NotFoundError,
} from "../../../../../exceptions";
import { CustomRequest } from "../../../../../middlewares/check-jwt";
import {
  findVerificationCheckoutPricing,
  PricingRecordError,
} from "../../../../services/database/pricing";
import { createStripeVerificationCheckout } from "../../services/verification-checkout";
import { prismaClient } from "../../../../../utils/prisma";
import { logger } from "../../../../../utils/logger";

const payableStatuses: VerificationStatus[] = [
  VerificationStatus.DRAFT,
  VerificationStatus.PENDING_PAYMENT,
  VerificationStatus.PAYMENT_FAILED,
];

const toApiError = (error: PricingRecordError) => {
  switch (error.code) {
    case "NOT_FOUND":
      return new NotFoundError(error.message);
    case "INVALID_SELECTION":
      return new BadRequestError(error.message);
    case "QUOTE_EXPIRED":
    case "QUOTE_OUT_OF_RANGE":
    case "INVALID_STATE":
      return new ConflictError(error.message);
  }
};

const toPricingResponse = (
  pricing: Awaited<ReturnType<typeof findVerificationCheckoutPricing>>,
) => ({
  verificationAmountUsdCents: pricing.verificationAmountUsdCents,
  monitoringFirstPeriodUsdCents: pricing.monitoringAmountUsdCents,
  totalUsdCents: pricing.totalUsdCents,
  verificationAmountNgnKobo: pricing.verificationAmountNgnKobo,
  monitoringFirstPeriodNgnKobo: pricing.monitoringAmountNgnKobo,
  totalNgnKobo: pricing.totalNgnKobo,
  chargedAmountMinor: pricing.amountMinor,
  currency: pricing.currency,
  ...(pricing.currency === "NGN"
    ? {
        exchangeRate:
          pricing.pricingSettings?.usdToNgnRate.toString() ??
          pricing.quote?.usdToNgnRate?.toString() ??
          null,
        exchangeRateVersion: pricing.pricingSettings?.version ?? pricing.quote?.rateVersion ?? null,
      }
    : {}),
});

export const initializeVerificationPaymentStripe = async (
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

    const request = await prismaClient.verificationRequest.findUnique({
      where: { id: verificationRequestId },
      select: { userId: true, status: true },
    });
    if (!request) {
      return next(new NotFoundError("Verification request not found."));
    }
    if (request.userId !== userId) {
      return next(new ForbiddenError("You cannot pay for this request."));
    }
    if (!payableStatuses.includes(request.status)) {
      return next(new ConflictError("This verification request is not available for payment."));
    }

    const checkout = await createStripeVerificationCheckout(verificationRequestId, userId);

    res.status(HttpStatusCode.OK).json({
      url: checkout.checkoutUrl,
      sessionId: checkout.sessionId,
      reference: checkout.reference,
      transactionId: checkout.transactionId,
      pricing: toPricingResponse(checkout.pricing),
    });
  } catch (error) {
    logger.error(`Error initializing Stripe verification payment: ${error}`);
    next(
      error instanceof PricingRecordError
        ? toApiError(error)
        : error instanceof ApiError
          ? error
          : new ApiError(HttpStatusCode.INTERNAL_SERVER, "Unable to initialize payment."),
    );
  }
};

export default initializeVerificationPaymentStripe;
