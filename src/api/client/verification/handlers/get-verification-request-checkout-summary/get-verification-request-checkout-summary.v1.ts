import { PaymentProvider } from "@prisma/client";
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
import { usdCentsToNgnKobo } from "../../../../services/pricing-calculation";
import {
  findVerificationCheckoutPricing,
  PricingRecordError,
} from "../../../../services/database/pricing";

export const getVerificationRequestCheckoutSummary = async (
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
        user: true,
        verificationTier: true,
        monitoringPlan: true,
      },
    });
    if (!request) {
      return next(new NotFoundError("Verification request not found."));
    }
    if (!request.verificationTier) {
      return next(new BadRequestError("Select a verification tier before checkout."));
    }

    const pricingSettings = await prismaClient.pricingSettings.findFirst({
      where: { active: true },
      orderBy: { version: "desc" },
    });
    const activeQuote = request.verificationTier.quoteRequired
      ? await prismaClient.premiumQuote.findFirst({
          where: {
            verificationRequestId,
            verificationTierId: request.verificationTier.id,
            monitoringPlanId: request.monitoringPlanId,
            status: { in: ["ISSUED", "ACCEPTED"] },
          },
          orderBy: { createdAt: "desc" },
        })
      : null;
    const monitoringUsdCents = request.monitoringPlan?.priceUsdCents ?? 0;

    const countryCode = request.user.countryCode?.toUpperCase();
    const isNg = countryCode === "NG";
    const currency = isNg ? "NGN" : "USD";
    const provider = isNg ? "PAYSTACK" : "STRIPE";
    let checkoutPricing: Awaited<ReturnType<typeof findVerificationCheckoutPricing>> | undefined;
    let paymentUnavailableReason: string | null = null;
    try {
      checkoutPricing = await findVerificationCheckoutPricing({
        requestId: verificationRequestId,
        userId,
        provider: provider === "PAYSTACK" ? PaymentProvider.PAYSTACK : PaymentProvider.STRIPE,
      });
    } catch (error) {
      if (!(error instanceof PricingRecordError)) throw error;
      paymentUnavailableReason = error.message;
    }

    const packageUsdCents =
      checkoutPricing?.verificationAmountUsdCents ??
      activeQuote?.quoteUsdCents ??
      request.verificationTier.priceUsdCents ??
      0;
    const packageNgnKobo =
      checkoutPricing?.verificationAmountNgnKobo ??
      activeQuote?.quoteNgnKobo ??
      (pricingSettings && packageUsdCents > 0
        ? usdCentsToNgnKobo(packageUsdCents, pricingSettings.usdToNgnRate)
        : null);
    const monitoringNgnKobo =
      checkoutPricing?.monitoringAmountNgnKobo ??
      (pricingSettings && monitoringUsdCents > 0
        ? usdCentsToNgnKobo(monitoringUsdCents, pricingSettings.usdToNgnRate)
        : 0);
    const totalUsdCents = checkoutPricing?.totalUsdCents ?? packageUsdCents + monitoringUsdCents;
    const ngnAmount = packageNgnKobo === null ? null : packageNgnKobo + monitoringNgnKobo;

    const response = {
      verificationRequestId: request.id,
      countryCode: countryCode ?? null,
      currency,
      provider,
      lineItems: [
        {
          type: "VERIFICATION",
          description: request.verificationTier.name,
          amountUsdCents: packageUsdCents,
          amountNgnKobo: packageNgnKobo,
        },
        ...(monitoringUsdCents > 0 && request.monitoringPlan
          ? [
              {
                type: "MONITORING",
                description: `${request.monitoringPlan.name} monitoring — first period`,
                amountUsdCents: monitoringUsdCents,
                amountNgnKobo: monitoringNgnKobo,
              },
            ]
          : []),
      ],
      totals: {
        usdCents: totalUsdCents,
        ngnKobo: ngnAmount,
      },
      charge: {
        amountMinor: isNg ? ngnAmount : totalUsdCents,
        currency,
        display: isNg ? (ngnAmount === null ? null : `NGN ${ngnAmount}`) : `USD ${totalUsdCents}`,
      },
      exchangeRate: pricingSettings
        ? {
            baseCurrency: "USD",
            quoteCurrency: "NGN",
            rate: pricingSettings.usdToNgnRate.toString(),
            version: pricingSettings.version,
            rounding: pricingSettings.roundingRule,
          }
        : null,
      quote: activeQuote
        ? {
            id: activeQuote.id,
            status: activeQuote.status,
            amountUsdCents: activeQuote.quoteUsdCents,
            amountNgnKobo: activeQuote.quoteNgnKobo,
            ngnConversionRate: activeQuote.usdToNgnRate?.toString() ?? null,
            ngnRateVersion: activeQuote.rateVersion ?? null,
            expiresAt: activeQuote.expiresAt,
          }
        : null,
      quotePricing: activeQuote
        ? {
            amountUsdCents: activeQuote.quoteUsdCents,
            amountNgnKobo: activeQuote.quoteNgnKobo,
            ngnConversionRate: activeQuote.usdToNgnRate?.toString() ?? null,
            ngnRateVersion: activeQuote.rateVersion ?? null,
          }
        : null,
      recurringConsentRequired: Boolean(request.monitoringPlanId && !request.recurringConsent),
      canInitializePayment: Boolean(checkoutPricing),
      paymentUnavailableReason,
    };

    res.status(HttpStatusCode.OK).json(response);
  } catch (error) {
    logger.error(`Error building checkout summary requestId=${req.params.id}: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};

export default getVerificationRequestCheckoutSummary;
