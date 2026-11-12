import { NextFunction, Request, Response } from "express";
import {
  ApiError,
  BadRequestError,
  HttpStatusCode,
  NotFoundError,
} from "../../../../../exceptions";
import { CustomRequest } from "../../../../../middlewares/check-jwt";
import { findPremiumQuoteForUser } from "../../../../services/database/pricing";
import { prismaClient } from "../../../../../utils/prisma";
import { logger } from "../../../../../utils/logger";

export const getVerificationRequestQuote = async (
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

    const quote = await findPremiumQuoteForUser(verificationRequestId, userId);
    if (!quote) {
      return next(new NotFoundError("Premium quote not found."));
    }

    let latestTransaction = (quote as { transactions?: Array<{
      id: string;
      provider: string | null;
      currency: string;
      authorizationUrl: string | null;
      providerRef: string | null;
      status: string;
    }> }).transactions?.[0];

    if (!latestTransaction && quote.status === "ACCEPTED") {
      latestTransaction = (await prismaClient.transaction.findFirst({
        where: {
          verificationRequestId: quote.verificationRequestId,
          authorizationUrl: { not: null },
        },
        orderBy: { createdAt: "desc" },
      })) ?? undefined;
    }

    const payment =
      latestTransaction && latestTransaction.authorizationUrl
        ? {
            provider: latestTransaction.provider,
            currency: latestTransaction.currency,
            checkoutUrl: latestTransaction.authorizationUrl,
            checkoutExpiresAt: null,
            reference: latestTransaction.providerRef,
            transactionId: latestTransaction.id,
            status: latestTransaction.status,
          }
        : null;

    const response = {
      id: quote.id,
      verificationRequestId: quote.verificationRequestId,
      status: quote.status,
      intendedUse: quote.verificationRequest.intendedUse,
      notes: quote.verificationRequest.additionalNote,
      amountUsdCents: quote.quoteUsdCents ?? null,
      amountNgnKobo: quote.quoteNgnKobo ?? null,
      ngnConversionRate: quote.usdToNgnRate?.toString() ?? null,
      ngnRateVersion: quote.rateVersion ?? null,
      scopeSummary: quote.scopeSummary ?? quote.verificationTier?.description ?? null,
      expiresAt: quote.expiresAt,
      acceptedAt: quote.acceptedAt,
      payment,
    };

    res.status(HttpStatusCode.OK).json(response);
  } catch (error) {
    logger.error(`Error fetching Premium quote requestId=${req.params.id}: ${error}`);
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Internal server error."));
  }
};

export default getVerificationRequestQuote;
