import Stripe from "stripe";
import { PaymentStatus, Prisma, VerificationStatus } from "@prisma/client";
import { Request, Response } from "express";
import { stripe } from "../../libs/stripe";
import { logger } from "../../utils/logger";
import { prismaClient } from "../../utils/prisma";

type RequestWithRawBody = Request & { rawBody?: Buffer };

type CheckoutMetadata = {
  userId: string;
  verificationRequestId: string;
  transactionId: string;
  description: string;
};

const getMetadata = (metadata: Stripe.Metadata): CheckoutMetadata | null => {
  const { userId, verificationRequestId, transactionId, description } = metadata;
  if (!userId || !verificationRequestId || !transactionId || !description) return null;
  return { userId, verificationRequestId, transactionId, description };
};

const toDate = (seconds: number | null | undefined) => (seconds ? new Date(seconds * 1000) : null);

const getSubscriptionDetails = (subscription: Stripe.Subscription) => {
  const item = subscription.items.data[0];
  return {
    priceId: item?.price.id,
    currentPeriodEnd: toDate(item?.current_period_end),
    lastRenewalDate: toDate(item?.current_period_start),
  };
};

const markTransactionSuccessful = async (
  metadata: CheckoutMetadata,
  providerRef: string,
  stripeSubscriptionId?: string,
) => {
  const transaction = await prismaClient.transaction.findUnique({
    where: { id: metadata.transactionId },
  });
  if (!transaction || transaction.verificationRequestId !== metadata.verificationRequestId) {
    logger.warn(`Stripe transaction not found transactionId=${metadata.transactionId}`);
    return null;
  }

  await prismaClient.$transaction([
    prismaClient.transaction.updateMany({
      where: { id: transaction.id, status: { not: PaymentStatus.SUCCESS } },
      data: {
        status: PaymentStatus.SUCCESS,
        providerRef,
        ...(stripeSubscriptionId ? { stripeSubscriptionId } : {}),
        paidAt: new Date(),
      },
    }),
    prismaClient.verificationRequest.updateMany({
      where: {
        id: transaction.verificationRequestId,
        status: { notIn: [VerificationStatus.COMPLETED, VerificationStatus.CANCELLED] },
      },
      data: { status: VerificationStatus.SUBMITTED },
    }),
  ]);

  return transaction;
};

const upsertSubscription = async (
  subscription: Stripe.Subscription,
  metadata: CheckoutMetadata,
) => {
  const transaction = await prismaClient.transaction.findUnique({
    where: { id: metadata.transactionId },
    include: { verificationRequest: true },
  });
  if (!transaction || transaction.verificationRequest.userId !== metadata.userId) {
    logger.warn(`Stripe subscription transaction not found subscriptionId=${subscription.id}`);
    return;
  }

  const details = getSubscriptionDetails(subscription);
  if (!details.priceId) {
    throw new Error(`Stripe subscription has no price subscriptionId=${subscription.id}`);
  }
  if (!transaction.verificationRequest.verificationPlanId) {
    throw new Error(`Verification request has no plan transactionId=${metadata.transactionId}`);
  }

  const active = ["active", "trialing"].includes(subscription.status);
  await prismaClient.stripeSubscription.upsert({
    where: { subscriptionId: subscription.id },
    create: {
      userId: metadata.userId,
      verificationRequestId: metadata.verificationRequestId,
      verificationPlanId: transaction.verificationRequest.verificationPlanId,
      subscriptionId: subscription.id,
      status: active ? "ACTIVE" : "INACTIVE",
      currentPeriodEnd: details.currentPeriodEnd,
      lastRenewalDate: details.lastRenewalDate,
    },
    update: {
      status: active ? "ACTIVE" : "INACTIVE",
      currentPeriodEnd: details.currentPeriodEnd,
      lastRenewalDate: details.lastRenewalDate,
    },
  });

  if (!active) {
    await prismaClient.verificationRequest.updateMany({
      where: {
        id: metadata.verificationRequestId,
        status: VerificationStatus.PENDING_PAYMENT,
      },
      data: { status: VerificationStatus.PAYMENT_FAILED },
    });
  }
};

const deactivateSubscription = async (subscriptionId: string) => {
  const subscription = await prismaClient.stripeSubscription.findUnique({
    where: { subscriptionId },
  });
  if (!subscription) return;

  await prismaClient.$transaction([
    prismaClient.stripeSubscription.update({
      where: { subscriptionId },
      data: { status: "INACTIVE" },
    }),
    prismaClient.verificationRequest.updateMany({
      where: {
        id: subscription.verificationRequestId,
        status: VerificationStatus.PENDING_PAYMENT,
      },
      data: { status: VerificationStatus.PAYMENT_FAILED },
    }),
  ]);
};

const recordRenewalPayment = async (invoice: Stripe.Invoice) => {
  const invoiceWithSubscription = invoice as Stripe.Invoice & {
    subscription?: string | Stripe.Subscription | null;
    amount_paid?: number | null;
    currency?: string | null;
    status_transitions?: { paid_at?: number | null };
  };
  const subscriptionId = invoiceWithSubscription.subscription;
  if (typeof subscriptionId !== "string") {
    logger.warn(`Stripe invoice has no subscription invoiceId=${invoice.id}`);
    return;
  }

  const subscription = await prismaClient.stripeSubscription.findUnique({
    where: { subscriptionId },
  });
  if (!subscription) {
    logger.warn(`Stripe subscription not found subscriptionId=${subscriptionId}`);
    return;
  }

  if (invoice.billing_reason === "subscription_create") {
    const initialTransaction = await prismaClient.transaction.findFirst({
      where: { stripeSubscriptionId: subscriptionId, status: PaymentStatus.SUCCESS },
    });
    if (initialTransaction) return;
  }

  const paidAt = invoiceWithSubscription.status_transitions?.paid_at
    ? new Date(invoiceWithSubscription.status_transitions.paid_at * 1000)
    : new Date(invoice.created * 1000);
  const transaction = await prismaClient.transaction.upsert({
    where: { providerRef: invoice.id },
    create: {
      verificationRequestId: subscription.verificationRequestId,
      amountInCents: invoiceWithSubscription.amount_paid ?? 0,
      currency: invoiceWithSubscription.currency ?? "NGN",
      method: "CARD",
      status: PaymentStatus.SUCCESS,
      providerRef: invoice.id,
      stripeSubscriptionId: subscriptionId,
      paidAt,
    },
    update: {
      status: PaymentStatus.SUCCESS,
      stripeSubscriptionId: subscriptionId,
      paidAt,
    },
  });

  await prismaClient.verificationRequest.updateMany({
    where: {
      id: transaction.verificationRequestId,
      status: { notIn: [VerificationStatus.COMPLETED, VerificationStatus.CANCELLED] },
    },
    data: { status: VerificationStatus.SUBMITTED },
  });
};

export const stripeWebhook = async (req: Request, res: Response) => {
  const signature = req.headers["stripe-signature"];
  const providedSignature = Array.isArray(signature) ? signature[0] : signature;
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const rawBody = (req as RequestWithRawBody).rawBody;

  if (!secret || !providedSignature || !rawBody) {
    logger.error("Stripe webhook signature configuration or raw body is missing");
    return res.sendStatus(400);
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, providedSignature, secret);
  } catch (error) {
    logger.error(`Stripe webhook signature verification failed: ${error}`);
    return res.sendStatus(400);
  }

  const existingWebhook = await prismaClient.webhookEvent.findUnique({
    where: { eventId: event.id },
  });
  if (existingWebhook?.processed) return res.json({ received: true });

  await prismaClient.webhookEvent.upsert({
    where: { eventId: event.id },
    create: {
      integration: "stripe",
      eventId: event.id,
      data: event as unknown as Prisma.InputJsonValue,
      verified: true,
    },
    update: { data: event as unknown as Prisma.InputJsonValue, verified: true },
  });

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const metadata = getMetadata(session.metadata ?? {});
        if (!metadata) {
          logger.warn(`Stripe Checkout metadata is incomplete sessionId=${session.id}`);
          break;
        }

        let subscription: Stripe.Subscription | undefined;
        if (typeof session.subscription === "string") {
          subscription = await stripe.subscriptions.retrieve(session.subscription);
        }
        await markTransactionSuccessful(metadata, session.id, subscription?.id);
        if (subscription) {
          await upsertSubscription(subscription, metadata);
        }
        break;
      }
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const metadata = getMetadata(subscription.metadata);
        if (metadata) {
          await upsertSubscription(subscription, metadata);
        } else {
          const stored = await prismaClient.stripeSubscription.findUnique({
            where: { subscriptionId: subscription.id },
          });
          if (stored) {
            const details = getSubscriptionDetails(subscription);
            await prismaClient.stripeSubscription.update({
              where: { subscriptionId: subscription.id },
              data: {
                status: ["active", "trialing"].includes(subscription.status)
                  ? "ACTIVE"
                  : "INACTIVE",
                currentPeriodEnd: details.currentPeriodEnd,
                lastRenewalDate: details.lastRenewalDate,
              },
            });
          }
        }
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await deactivateSubscription(subscription.id);
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const invoiceWithSubscription = invoice as Stripe.Invoice & {
          subscription?: string | Stripe.Subscription | null;
        };
        if (typeof invoiceWithSubscription.subscription === "string") {
          await deactivateSubscription(invoiceWithSubscription.subscription);
        }
        break;
      }
      case "invoice.paid": {
        await recordRenewalPayment(event.data.object as Stripe.Invoice);
        break;
      }
      default:
        logger.info(`Ignoring unsupported Stripe event=${event.type}`);
    }

    await prismaClient.webhookEvent.update({
      where: { eventId: event.id },
      data: { processed: true },
    });
    return res.json({ received: true });
  } catch (error) {
    logger.error(`Error handling Stripe event=${event.type} eventId=${event.id}: ${error}`);
    return res.sendStatus(500);
  }
};
