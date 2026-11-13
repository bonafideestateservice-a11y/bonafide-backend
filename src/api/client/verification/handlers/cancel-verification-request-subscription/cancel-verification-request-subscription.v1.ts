import { NextFunction, Request, Response } from "express";
import { PaymentProvider } from "@prisma/client";
import { ApiError, ConflictError, HttpStatusCode, NotFoundError } from "../../../../../exceptions";
import { CustomRequest } from "../../../../../middlewares/check-jwt";
import { cancelPaystackSubscription } from "../../../../../libs/paystack/paystack";
import { cancelStripeSubscription } from "../../../../../libs/stripe/stripe";
import {
  findSubscriptionForCancellation,
  markPaystackSubscriptionDisabled,
  markStripeSubscriptionInactive,
} from "../../services/database/subscription-cancellation";
import {
  announceSubscriptionEnded,
  completeRequestIfFinished,
} from "../../../../services/database/verification-lifecycle";
import { logger } from "../../../../../utils/logger";
import { prismaClient } from "../../../../../utils/prisma";

const isAlreadyStopped = (status: string) =>
  status === "NON_RENEWING" ||
  status === "DISABLED" ||
  status === "EXPIRED" ||
  status === "INACTIVE";

export const cancelVerificationRequestSubscription = async (
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
      return next(new NotFoundError("Verification request not found."));
    }

    const subscriptions = await findSubscriptionForCancellation(
      verificationRequestId,
      userId,
    );
    if (!subscriptions) {
      return next(new NotFoundError("Verification request not found."));
    }

    const candidates = [
      ...subscriptions.monitoringSubscriptions.map((subscription) => ({
        provider: subscription.provider,
        providerSubscriptionId: subscription.providerSubscriptionId,
        emailToken: subscription.emailToken,
        status: subscription.status,
        createdAt: subscription.createdAt,
        monitoringSubscriptionId: subscription.id,
      })),
      ...(subscriptions.legacyPaystackSubscription
        ? [
            {
              provider: PaymentProvider.PAYSTACK,
              providerSubscriptionId:
                subscriptions.legacyPaystackSubscription.subscriptionCode,
              emailToken: subscriptions.legacyPaystackSubscription.emailToken,
              status: subscriptions.legacyPaystackSubscription.status,
              createdAt: subscriptions.legacyPaystackSubscription.createdAt,
              monitoringSubscriptionId: undefined,
            },
          ]
        : []),
      ...(subscriptions.legacyStripeSubscription
        ? [
            {
              provider: PaymentProvider.STRIPE,
              providerSubscriptionId: subscriptions.legacyStripeSubscription.subscriptionId,
              emailToken: null,
              status: subscriptions.legacyStripeSubscription.status,
              createdAt: subscriptions.legacyStripeSubscription.createdAt,
              monitoringSubscriptionId: undefined,
            },
          ]
        : []),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const subscription =
      candidates.find(
        ({ status, providerSubscriptionId }) =>
          !isAlreadyStopped(status) && Boolean(providerSubscriptionId),
      ) ??
      candidates.find(({ status }) => !isAlreadyStopped(status)) ??
      candidates[0];

    if (!subscription) {
      return next(new ConflictError("No subscription is associated with this request."));
    }

    if (isAlreadyStopped(subscription.status)) {
      res.status(HttpStatusCode.OK).json({
        status: "success",
        message: "Subscription is already inactive or set not to renew.",
        data: {
          provider: subscription.provider,
          subscriptionStatus: subscription.status,
        },
      });
      return;
    }

    if (!subscription.providerSubscriptionId) {
      return next(new ConflictError("Subscription cancellation details are unavailable."));
    }

    let changed = false;
    let subscriptionStatus: string;
    if (subscription.provider === PaymentProvider.PAYSTACK) {
      if (!subscription.emailToken) {
        return next(new ConflictError("Paystack subscription cancellation details are unavailable."));
      }
      await cancelPaystackSubscription(
        subscription.providerSubscriptionId,
        subscription.emailToken,
      );
      changed = await markPaystackSubscriptionDisabled({
        verificationRequestId,
        providerSubscriptionId: subscription.providerSubscriptionId,
        ...(subscription.monitoringSubscriptionId
          ? { monitoringSubscriptionId: subscription.monitoringSubscriptionId }
          : {}),
      });
      subscriptionStatus = "DISABLED";
    } else {
      await cancelStripeSubscription(subscription.providerSubscriptionId);
      changed = await markStripeSubscriptionInactive({
        verificationRequestId,
        providerSubscriptionId: subscription.providerSubscriptionId,
        ...(subscription.monitoringSubscriptionId
          ? { monitoringSubscriptionId: subscription.monitoringSubscriptionId }
          : {}),
      });
      subscriptionStatus = subscription.monitoringSubscriptionId ? "DISABLED" : "INACTIVE";
    }

    if (changed) {
      await completeRequestIfFinished(prismaClient, verificationRequestId);
      announceSubscriptionEnded(verificationRequestId);
    }

    res.status(HttpStatusCode.OK).json({
      status: "success",
      message: "Subscription cancelled successfully.",
      data: { provider: subscription.provider, subscriptionStatus },
    });
  } catch (error) {
    logger.error(`Error cancelling subscription requestId=${req.params.id}: ${error}`);
    if (error instanceof ApiError) {
      return next(error);
    }
    next(new ApiError(HttpStatusCode.INTERNAL_SERVER, "Unable to cancel subscription."));
  }
};
