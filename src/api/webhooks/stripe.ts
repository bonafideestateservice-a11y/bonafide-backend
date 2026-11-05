import Stripe from "stripe";
import { MonitoringSubscription, PaymentProvider, PaymentStatus, Prisma } from "@prisma/client";
import { Request, Response } from "express";
import { getStripeClient } from "../../libs/stripe";
import {
  markPropertyPaymentFailed,
  markPropertyPaymentSuccessful,
} from "../services/database/property-request";
import { logger } from "../../utils/logger";
import { prismaClient } from "../../utils/prisma";
import { appEvents, AppEventTypes } from "../../events";
import {
  announcePaymentFailed,
  announceSubscriptionEnded,
  completeRequestIfFinished,
  recordFailedRenewal,
  markRequestPaid,
  markRequestPaymentFailed,
} from "../services/database/verification-lifecycle";
import {
  activateMonitoringForPaidTransaction,
  createMonitoringRenewalSnapshot,
} from "../services/database/pricing";

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

// past_due: a renewal failed and Stripe is still retrying, so the subscription stays active.
const ACTIVE_SUBSCRIPTION_STATUSES: Stripe.Subscription.Status[] = [
  "active",
  "trialing",
  "past_due",
];
const isActiveSubscription = (status: Stripe.Subscription.Status) =>
  ACTIVE_SUBSCRIPTION_STATUSES.includes(status);

/**
 * Apply an inactive subscription to its request: "unpaid" means Stripe gave up retrying (the
 * period is unpaid); anything else (canceled, incomplete_expired, paused) means it ended.
 * The client is emailed when the subscription has just stopped being active.
 */
const settleInactiveSubscription = async (
  verificationRequestId: string,
  status: Stripe.Subscription.Status,
  wasActive: boolean,
) => {
  if (status === "unpaid") {
    announcePaymentFailed(
      await markRequestPaymentFailed(prismaClient, verificationRequestId),
      verificationRequestId,
    );
    return;
  }
  await completeRequestIfFinished(prismaClient, verificationRequestId);
  if (wasActive) announceSubscriptionEnded(verificationRequestId);
};

const getSubscriptionDetails = (subscription: Stripe.Subscription) => {
  const item = subscription.items.data[0];
  return {
    priceId: item?.price.id,
    currentPeriodEnd: toDate(item?.current_period_end),
    currentPeriodStart: toDate(item?.current_period_start),
    lastRenewalDate: toDate(item?.current_period_start),
  };
};

const renewalSnapshot = (
  subscription: MonitoringSubscription,
  amountMinor: number,
  currency: string,
) => {
  if (
    !subscription.monitoringPlanId ||
    !subscription.interval ||
    !subscription.planVersion ||
    !subscription.intervalCount ||
    !subscription.priceUsdCents ||
    !subscription.checksPerPeriod ||
    !subscription.reportsPerPeriod ||
    !subscription.providerPriceVersionId ||
    !subscription.consentAt
  ) {
    throw new Error(`Stripe monitoring terms are incomplete subscriptionId=${subscription.id}`);
  }
  return createMonitoringRenewalSnapshot({
    provider: PaymentProvider.STRIPE,
    currency,
    planId: subscription.monitoringPlanId,
    planCode: subscription.interval,
    planVersion: subscription.planVersion,
    intervalCount: subscription.intervalCount,
    amountUsdCents: subscription.priceUsdCents,
    amountMinor,
    checksPerPeriod: subscription.checksPerPeriod,
    reportsPerPeriod: subscription.reportsPerPeriod,
    providerPriceVersionId: subscription.providerPriceVersionId,
    consentAt: subscription.consentAt,
  });
};

type PaymentTransaction = Prisma.TransactionGetPayload<{
  include: {
    verificationRequest: {
      include: {
        user: true;
        verificationPlan: { include: { verificationType: true } };
      };
    };
  };
}>;

const emitPaymentReceived = (transaction: PaymentTransaction) => {
  appEvents.emit(AppEventTypes.PAYMENT_RECEIVED, {
    userId: transaction.verificationRequest.user.id,
    email: transaction.verificationRequest.user.email,
    firstName: transaction.verificationRequest.user.fullName,
    amount: transaction.amountInCents,
    reference: transaction.providerRef ?? transaction.id,
    payment_receipt: transaction.providerRef ?? transaction.id,
    booking_ref: transaction.verificationRequestId,
    receipt_id: transaction.id,
    currency: transaction.currency,
    service_name: transaction.verificationRequest.verificationPlan?.verificationType.name,
  });
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

  const newlyPaid = await prismaClient.$transaction(async (tx) => {
    const updated = await tx.transaction.updateMany({
      where: { id: transaction.id, status: { not: PaymentStatus.SUCCESS } },
      data: {
        status: PaymentStatus.SUCCESS,
        providerRef,
        ...(stripeSubscriptionId ? { stripeSubscriptionId } : {}),
        paidAt: new Date(),
      },
    });
    await markRequestPaid(tx, transaction.verificationRequestId);
    return updated.count > 0;
  });

  const paidTransaction = await prismaClient.transaction.findUnique({
    where: { id: transaction.id },
    include: {
      verificationRequest: {
        include: {
          user: true,
          verificationPlan: { include: { verificationType: true } },
        },
      },
    },
  });

  if (paidTransaction && newlyPaid) emitPaymentReceived(paidTransaction);

  return paidTransaction;
};

const upsertSubscription = async (
  subscription: Stripe.Subscription,
  metadata: CheckoutMetadata,
) => {
  const transaction = await prismaClient.transaction.findUnique({
    where: { id: metadata.transactionId },
    include: { verificationRequest: true },
  });
  if (
    !transaction ||
    transaction.verificationRequest.userId !== metadata.userId ||
    transaction.verificationRequestId !== metadata.verificationRequestId
  ) {
    logger.warn(`Stripe subscription transaction not found subscriptionId=${subscription.id}`);
    return;
  }

  const details = getSubscriptionDetails(subscription);
  if (!details.priceId) {
    throw new Error(`Stripe subscription has no price subscriptionId=${subscription.id}`);
  }
  const active = isActiveSubscription(subscription.status);
  if (transaction.provider === PaymentProvider.STRIPE && transaction.pricingSnapshot) {
    if (transaction.status !== PaymentStatus.SUCCESS) {
      throw new Error(
        `Stripe subscription payment is not settled subscriptionId=${subscription.id}`,
      );
    }
    const periodStart = details.currentPeriodStart ?? transaction.paidAt;
    const periodEnd = details.currentPeriodEnd;
    if (!periodStart || !periodEnd) {
      throw new Error(`Stripe subscription period is missing subscriptionId=${subscription.id}`);
    }
    const previous = await prismaClient.monitoringSubscription.findUnique({
      where: {
        provider_providerSubscriptionId: {
          provider: PaymentProvider.STRIPE,
          providerSubscriptionId: subscription.id,
        },
      },
      select: { status: true },
    });
    const activated = await activateMonitoringForPaidTransaction({
      transactionId: transaction.id,
      provider: PaymentProvider.STRIPE,
      providerSubscriptionId: subscription.id,
      startedAt: periodStart,
      periodStart,
      periodEnd,
    });
    if (!activated) {
      throw new Error(
        `Stripe subscription has no monitoring selection subscriptionId=${subscription.id}`,
      );
    }

    const terminal = previous?.status === "DISABLED" || previous?.status === "EXPIRED";
    if (!terminal) {
      await prismaClient.monitoringSubscription.updateMany({
        where: {
          provider: PaymentProvider.STRIPE,
          providerSubscriptionId: subscription.id,
        },
        data: {
          status:
            subscription.status === "unpaid" ? "PAYMENT_FAILED" : active ? "ACTIVE" : "DISABLED",
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          ...(subscription.status === "canceled" ? { cancelledAt: new Date() } : {}),
        },
      });
    }
    if (!active) {
      await settleInactiveSubscription(
        metadata.verificationRequestId,
        subscription.status,
        previous?.status === "ACTIVE",
      );
    }
    return;
  }

  if (!transaction.verificationRequest.verificationPlanId) {
    throw new Error(`Verification request has no plan transactionId=${metadata.transactionId}`);
  }

  const previous = await prismaClient.stripeSubscription.findUnique({
    where: { subscriptionId: subscription.id },
    select: { status: true },
  });
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
    await settleInactiveSubscription(
      metadata.verificationRequestId,
      subscription.status,
      previous?.status === "ACTIVE",
    );
  }
};

/** customer.subscription.deleted: no more renewals will be charged. */
const endSubscription = async (subscriptionId: string) => {
  const monitoringSubscription = await prismaClient.monitoringSubscription.findUnique({
    where: {
      provider_providerSubscriptionId: {
        provider: PaymentProvider.STRIPE,
        providerSubscriptionId: subscriptionId,
      },
    },
  });
  if (monitoringSubscription) {
    await prismaClient.monitoringSubscription.updateMany({
      where: {
        provider: PaymentProvider.STRIPE,
        providerSubscriptionId: subscriptionId,
        status: { notIn: ["DISABLED", "EXPIRED"] },
      },
      data: { status: "DISABLED", cancelledAt: new Date() },
    });
    await completeRequestIfFinished(prismaClient, monitoringSubscription.verificationRequestId);
    if (
      monitoringSubscription.status === "ACTIVE" ||
      monitoringSubscription.status === "NON_RENEWING"
    ) {
      announceSubscriptionEnded(monitoringSubscription.verificationRequestId);
    }
    return;
  }

  const subscription = await prismaClient.stripeSubscription.findUnique({
    where: { subscriptionId },
  });
  if (!subscription) return;

  await prismaClient.stripeSubscription.update({
    where: { subscriptionId },
    data: { status: "INACTIVE" },
  });
  await completeRequestIfFinished(prismaClient, subscription.verificationRequestId);
  if (subscription.status === "ACTIVE") {
    announceSubscriptionEnded(subscription.verificationRequestId);
  }
};

/**
 * invoice.payment_failed: flag the due payment, but keep the subscription active. Stripe
 * retries the charge; a later invoice.paid moves the request on, and giving up arrives as a
 * subscription update (unpaid/canceled) or deletion.
 */
const recordFailedInvoice = async (subscriptionId: string, invoice: Stripe.Invoice) => {
  const monitoringSubscription = await prismaClient.monitoringSubscription.findUnique({
    where: {
      provider_providerSubscriptionId: {
        provider: PaymentProvider.STRIPE,
        providerSubscriptionId: subscriptionId,
      },
    },
  });
  if (monitoringSubscription) {
    const snapshot = renewalSnapshot(
      monitoringSubscription,
      invoice.amount_due ?? 0,
      (invoice.currency ?? "usd").toUpperCase(),
    );
    await recordFailedRenewal({
      verificationRequestId: monitoringSubscription.verificationRequestId,
      providerRef: invoice.id,
      amountInCents: invoice.amount_due ?? 0,
      currency: (invoice.currency ?? "usd").toUpperCase(),
      provider: PaymentProvider.STRIPE,
      providerPriceVersionId: monitoringSubscription.providerPriceVersionId ?? undefined,
      stripeSubscriptionId: subscriptionId,
      pricingSnapshot: snapshot,
    });
    return;
  }

  const subscription = await prismaClient.stripeSubscription.findUnique({
    where: { subscriptionId },
    select: { verificationRequestId: true },
  });
  if (!subscription) return;

  await recordFailedRenewal({
    verificationRequestId: subscription.verificationRequestId,
    providerRef: invoice.id,
    amountInCents: invoice.amount_due ?? 0,
    currency: invoice.currency ?? "usd",
  });
};

/**
 * The subscription an invoice bills. Current API versions put it in
 * parent.subscription_details; older ones had invoice.subscription.
 */
const invoiceSubscriptionId = (invoice: Stripe.Invoice) => {
  const { parent, subscription } = invoice as Stripe.Invoice & {
    parent?: { subscription_details?: { subscription?: string | { id: string } | null } | null };
    subscription?: string | { id: string } | null;
  };
  const id = parent?.subscription_details?.subscription ?? subscription;
  return typeof id === "string" ? id : id?.id;
};

const recordRenewalPayment = async (invoice: Stripe.Invoice) => {
  const invoiceWithSubscription = invoice as Stripe.Invoice & {
    amount_paid?: number | null;
    currency?: string | null;
    status_transitions?: { paid_at?: number | null };
  };
  const paidAt = invoiceWithSubscription.status_transitions?.paid_at
    ? new Date(invoiceWithSubscription.status_transitions.paid_at * 1000)
    : new Date(invoice.created * 1000);
  const subscriptionId = invoiceSubscriptionId(invoice);
  if (!subscriptionId) {
    logger.warn(`Stripe invoice has no subscription invoiceId=${invoice.id}`);
    return;
  }

  const monitoringSubscription = await prismaClient.monitoringSubscription.findUnique({
    where: {
      provider_providerSubscriptionId: {
        provider: PaymentProvider.STRIPE,
        providerSubscriptionId: subscriptionId,
      },
    },
  });
  if (monitoringSubscription) {
    if (invoice.billing_reason === "subscription_create") {
      const initialTransaction = await prismaClient.transaction.findFirst({
        where: {
          stripeSubscriptionId: subscriptionId,
          provider: PaymentProvider.STRIPE,
          purpose: "INITIAL_PURCHASE",
          status: PaymentStatus.SUCCESS,
        },
      });
      if (initialTransaction) return;
      throw new Error(
        `Stripe initial checkout is not settled yet subscriptionId=${subscriptionId}`,
      );
    }

    const periodLine = invoice.lines?.data.find(
      (line) => line.period?.start !== undefined && line.period?.end !== undefined,
    );
    let periodStart = periodLine?.period.start ? toDate(periodLine.period.start) : null;
    let periodEnd = periodLine?.period.end ? toDate(periodLine.period.end) : null;
    if (!periodStart || !periodEnd) {
      const stripeSubscription = await getStripeClient().subscriptions.retrieve(subscriptionId);
      const details = getSubscriptionDetails(stripeSubscription);
      periodStart ??= details.currentPeriodStart;
      periodEnd ??= details.currentPeriodEnd;
    }
    if (!periodStart || !periodEnd) {
      throw new Error(`Stripe renewal period is missing invoiceId=${invoice.id}`);
    }

    const amountInCents = invoiceWithSubscription.amount_paid ?? 0;
    const currency = (invoiceWithSubscription.currency ?? "usd").toUpperCase();
    const snapshot = renewalSnapshot(monitoringSubscription, amountInCents, currency);
    const existing = await prismaClient.transaction.findUnique({
      where: { providerRef: invoice.id },
    });
    const transaction = await prismaClient.transaction.upsert({
      where: { providerRef: invoice.id },
      create: {
        verificationRequestId: monitoringSubscription.verificationRequestId,
        amountInCents,
        currency,
        method: "CARD",
        provider: PaymentProvider.STRIPE,
        purpose: "RENEWAL",
        providerPriceVersionId: monitoringSubscription.providerPriceVersionId,
        monitoringAmountUsdCents: monitoringSubscription.priceUsdCents,
        totalUsdCents: monitoringSubscription.priceUsdCents,
        pricingSnapshot: snapshot,
        status: PaymentStatus.SUCCESS,
        providerRef: invoice.id,
        stripeSubscriptionId: subscriptionId,
        paidAt,
      },
      update: {
        amountInCents,
        currency,
        provider: PaymentProvider.STRIPE,
        purpose: "RENEWAL",
        providerPriceVersionId: monitoringSubscription.providerPriceVersionId,
        monitoringAmountUsdCents: monitoringSubscription.priceUsdCents,
        totalUsdCents: monitoringSubscription.priceUsdCents,
        pricingSnapshot: snapshot,
        status: PaymentStatus.SUCCESS,
        stripeSubscriptionId: subscriptionId,
        paidAt,
      },
    });
    await markRequestPaid(prismaClient, transaction.verificationRequestId);
    await activateMonitoringForPaidTransaction({
      transactionId: transaction.id,
      provider: PaymentProvider.STRIPE,
      providerSubscriptionId: subscriptionId,
      customerCode: monitoringSubscription.customerCode ?? undefined,
      emailToken: monitoringSubscription.emailToken ?? undefined,
      startedAt: periodStart,
      periodStart,
      periodEnd,
    });

    const paidTransaction = await prismaClient.transaction.findUnique({
      where: { id: transaction.id },
      include: {
        verificationRequest: {
          include: {
            user: true,
            verificationPlan: { include: { verificationType: true } },
          },
        },
      },
    });
    if (paidTransaction && existing?.status !== PaymentStatus.SUCCESS) {
      emitPaymentReceived(paidTransaction);
    }
    return paidTransaction;
  }

  const subscription = await prismaClient.stripeSubscription.findUnique({
    where: { subscriptionId },
  });
  if (!subscription) {
    if (invoice.billing_reason === "subscription_cycle") {
      throw new Error(`Stripe renewal subscription is not stored subscriptionId=${subscriptionId}`);
    }
    logger.warn(`Stripe subscription not found subscriptionId=${subscriptionId}`);
    return;
  }

  if (invoice.billing_reason === "subscription_create") {
    const initialTransaction = await prismaClient.transaction.findFirst({
      where: { stripeSubscriptionId: subscriptionId, status: PaymentStatus.SUCCESS },
    });
    if (initialTransaction) return;
  }

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

  await markRequestPaid(prismaClient, transaction.verificationRequestId);

  const paidTransaction = await prismaClient.transaction.findUnique({
    where: { id: transaction.id },
    include: {
      verificationRequest: {
        include: {
          user: true,
          verificationPlan: { include: { verificationType: true } },
        },
      },
    },
  });

  if (paidTransaction) emitPaymentReceived(paidTransaction);

  return paidTransaction;
};

/**
 * Property payment Checkout events (metadata kind "property_payment"). Returns true when the
 * event was one, so the verification handling below is skipped.
 */
const handlePropertyPaymentEvent = async (event: Stripe.Event) => {
  if (!event.type.startsWith("checkout.session.")) return false;
  const session = event.data.object as Stripe.Checkout.Session;
  const { kind, propertyPaymentId } = session.metadata ?? {};
  if (kind !== "property_payment" || !propertyPaymentId) return false;

  const paid =
    (event.type === "checkout.session.completed" && session.payment_status === "paid") ||
    event.type === "checkout.session.async_payment_succeeded";
  const failed =
    event.type === "checkout.session.expired" ||
    event.type === "checkout.session.async_payment_failed";
  if (paid) {
    await markPropertyPaymentSuccessful(propertyPaymentId, {
      provider: PaymentProvider.STRIPE,
      providerRef: session.id,
      amount: session.amount_total ?? 0,
      currency: session.currency ?? "",
    });
  } else if (failed) {
    await markPropertyPaymentFailed(propertyPaymentId, session.id);
  }
  return true;
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
    event = getStripeClient().webhooks.constructEvent(rawBody, providedSignature, secret);
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
    if (await handlePropertyPaymentEvent(event)) {
      await prismaClient.webhookEvent.update({
        where: { eventId: event.id },
        data: { processed: true },
      });
      return res.json({ received: true });
    }

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
          subscription = await getStripeClient().subscriptions.retrieve(session.subscription);
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
            const active = isActiveSubscription(subscription.status);
            await prismaClient.stripeSubscription.update({
              where: { subscriptionId: subscription.id },
              data: {
                status: active ? "ACTIVE" : "INACTIVE",
                currentPeriodEnd: details.currentPeriodEnd,
                lastRenewalDate: details.lastRenewalDate,
              },
            });
            if (!active) {
              await settleInactiveSubscription(
                stored.verificationRequestId,
                subscription.status,
                stored.status === "ACTIVE",
              );
            }
          }
        }
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await endSubscription(subscription.id);
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = invoiceSubscriptionId(invoice);
        if (subscriptionId) await recordFailedInvoice(subscriptionId, invoice);
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
