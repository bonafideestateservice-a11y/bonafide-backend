import {
  PaymentProvider,
  MonitoringSubscriptionStatus,
  PaystackSubscriptionStatus,
  StripeSubscriptionStatus,
} from "@prisma/client";
import { prismaClient } from "../../../../../utils/prisma";
import { logger } from "../../../../../utils/logger";

export const findSubscriptionForCancellation = async (
  verificationRequestId: string,
  userId: string,
) => {
  try {
    const request = await prismaClient.verificationRequest.findFirst({
      where: { id: verificationRequestId, userId },
      select: {
        monitoringSubscriptions: {
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: {
            id: true,
            provider: true,
            providerSubscriptionId: true,
            emailToken: true,
            status: true,
            createdAt: true,
          },
        },
        paystackSubscription: {
          select: {
            subscriptionCode: true,
            emailToken: true,
            status: true,
            createdAt: true,
          },
        },
        stripeSubscription: {
          select: {
            subscriptionId: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });

    return request
      ? {
          monitoringSubscriptions: request.monitoringSubscriptions,
          legacyPaystackSubscription: request.paystackSubscription,
          legacyStripeSubscription: request.stripeSubscription,
        }
      : null;
  } catch (error) {
    logger.error(
      `Error finding subscription for cancellation requestId=${verificationRequestId}: ${error}`,
    );
    throw error;
  }
};

export const markPaystackSubscriptionDisabled = async (data: {
  verificationRequestId: string;
  providerSubscriptionId: string;
  monitoringSubscriptionId?: string;
}) => {
  try {
    const disabledAt = new Date();
    const updates = [
      prismaClient.paystackSubscription.updateMany({
        where: {
          verificationRequestId: data.verificationRequestId,
          subscriptionCode: data.providerSubscriptionId,
          status: {
            in: [PaystackSubscriptionStatus.ACTIVE, PaystackSubscriptionStatus.PAYMENT_FAILED],
          },
        },
        data: { status: PaystackSubscriptionStatus.DISABLED, disabledAt },
      }),
    ];

    if (data.monitoringSubscriptionId) {
      updates.push(
        prismaClient.monitoringSubscription.updateMany({
          where: {
            id: data.monitoringSubscriptionId,
            status: {
              in: [
                MonitoringSubscriptionStatus.ACTIVE,
                MonitoringSubscriptionStatus.PAYMENT_FAILED,
              ],
            },
          },
          data: {
            status: MonitoringSubscriptionStatus.DISABLED,
            disabledAt,
            cancelledAt: disabledAt,
          },
        }),
      );
    }

    const results = await prismaClient.$transaction(updates);
    logger.info(
      `Paystack subscription disabled requestId=${data.verificationRequestId} subscriptionId=${data.providerSubscriptionId}`,
    );
    return results.some((result) => result.count > 0);
  } catch (error) {
    logger.error(
      `Error marking Paystack subscription disabled requestId=${data.verificationRequestId}: ${error}`,
    );
    throw error;
  }
};

export const markStripeSubscriptionInactive = async (data: {
  verificationRequestId: string;
  providerSubscriptionId: string;
  monitoringSubscriptionId?: string;
}) => {
  try {
    const disabledAt = new Date();
    const updates = [
      prismaClient.stripeSubscription.updateMany({
        where: {
          verificationRequestId: data.verificationRequestId,
          subscriptionId: data.providerSubscriptionId,
          status: StripeSubscriptionStatus.ACTIVE,
        },
        data: { status: StripeSubscriptionStatus.INACTIVE },
      }),
    ];

    if (data.monitoringSubscriptionId) {
      updates.push(
        prismaClient.monitoringSubscription.updateMany({
          where: {
            id: data.monitoringSubscriptionId,
            provider: PaymentProvider.STRIPE,
            status: {
              in: [
                MonitoringSubscriptionStatus.ACTIVE,
                MonitoringSubscriptionStatus.PAYMENT_FAILED,
              ],
            },
          },
          data: {
            status: MonitoringSubscriptionStatus.DISABLED,
            disabledAt,
            cancelledAt: disabledAt,
          },
        }),
      );
    }

    const results = await prismaClient.$transaction(updates);
    logger.info(
      `Stripe subscription disabled requestId=${data.verificationRequestId} subscriptionId=${data.providerSubscriptionId}`,
    );
    return results.some((result) => result.count > 0);
  } catch (error) {
    logger.error(
      `Error marking Stripe subscription disabled requestId=${data.verificationRequestId}: ${error}`,
    );
    throw error;
  }
};
