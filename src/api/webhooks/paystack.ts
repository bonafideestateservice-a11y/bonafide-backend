import { NextFunction, Request, Response } from "express";
import crypto from "crypto";
import { PaymentStatus, Prisma } from "@prisma/client";
import { logger } from "../../utils/logger";
import { prismaClient } from "../../utils/prisma";
import { appEvents, AppEventTypes } from "../../events";
import {
  completeRequestIfFinished,
  markRequestPaid,
  markRequestPaymentFailed,
} from "../services/database/verification-lifecycle";

type PaystackEvent = {
  event?: string;
  data?: {
    id?: string | number;
    reference?: string;
    amount?: number;
    currency?: string;
    subscription_code?: string;
    invoice_code?: string;
    email_token?: string;
    customer?: { customer_code?: string; email?: string };
    plan?: { plan_code?: string };
    next_payment_date?: string;
    paid_at?: string;
    createdAt?: string;
    [key: string]: unknown;
  };
};

const subscriptionStatusByEvent = {
  "invoice.payment_failed": "PAYMENT_FAILED",
  "subscription.not_renew": "NON_RENEWING",
  "subscription.disable": "DISABLED",
} as const;

// Prefers IDs unique to the event's object (charge reference, invoice code), and includes the
// event type: subscription.create, .not_renew and .disable share a subscription_code and must
// not be mistaken for duplicates of each other.
const getEventId = (event: PaystackEvent) =>
  `${event.event ?? "unknown"}:${String(
    event.data?.reference ??
      event.data?.invoice_code ??
      event.data?.id ??
      event.data?.subscription_code ??
      `${Date.now()}-${crypto.randomUUID()}`,
  )}`;

const getSubscriptionCode = (event: PaystackEvent) =>
  event.data?.subscription_code ??
  (typeof event.data?.subscription === "object" && event.data.subscription
    ? (event.data.subscription as { subscription_code?: string }).subscription_code
    : undefined);

const getCustomerCode = (event: PaystackEvent) => event.data?.customer?.customer_code;

const getPlanCode = (event: PaystackEvent) => event.data?.plan?.plan_code;

/**
 * Find the subscription a renewal charge belongs to. Renewal charges may not carry the
 * subscription code; then the customer + plan is used. A customer can hold several
 * subscriptions on one plan (e.g. two properties), so the one whose next payment date is
 * closest to the charge wins.
*/

const findSubscriptionForCharge = async (event: PaystackEvent) => {
  const subscriptionCode = getSubscriptionCode(event);
  if (subscriptionCode) {
    return prismaClient.paystackSubscription.findUnique({ where: { subscriptionCode } });
  }

  const customerCode = getCustomerCode(event);
  const planCode = getPlanCode(event);
  if (!customerCode || !planCode) return null;

  const candidates = await prismaClient.paystackSubscription.findMany({
    where: { customerCode, verificationPlan: { paystackPlanCode: planCode } },
  });
  if (candidates.length <= 1) return candidates[0] ?? null;

  const chargedAt = event.data?.paid_at ? new Date(event.data.paid_at).getTime() : Date.now();
  const distance = (date: Date | null) =>
    date ? Math.abs(date.getTime() - chargedAt) : Number.POSITIVE_INFINITY;
  const [closest] = [...candidates].sort(
    (a, b) =>
      Number(b.status === "ACTIVE") - Number(a.status === "ACTIVE") ||
      distance(a.nextPaymentDate) - distance(b.nextPaymentDate),
  );
  logger.warn(
    `Paystack charge matched ${candidates.length} subscriptions for customer=${customerCode} plan=${planCode}; using subscription=${closest.subscriptionCode}`,
  );
  return closest;
};

const verifySignature = (req: Request) => {
  const signature = req.headers["x-paystack-signature"];
  const providedSignature = Array.isArray(signature) ? signature[0] : signature;
  const secret = process.env.PAYSTACK_SECRET_KEY || "";
  const expectedSignature = crypto
    .createHmac("sha512", secret)
    .update(JSON.stringify(req.body))
    .digest("hex");

  if (!providedSignature || providedSignature.length !== expectedSignature.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(providedSignature));
};

const handleChargeSuccess = async (event: PaystackEvent) => {
  const reference = event.data?.reference;
  if (!reference) {
    logger.warn("Paystack charge.success did not include a reference");
    return;
  }

  let transaction = await prismaClient.transaction.findFirst({
    where: { providerRef: reference },
  });

  if (!transaction) {
    // No transaction with this reference: a renewal charged by the subscription.
    const subscription = await findSubscriptionForCharge(event);

    if (!subscription) {
      logger.warn(`Paystack transaction not found reference=${reference}`);
      return;
    }

    transaction = await prismaClient.transaction.create({
      data: {
        verificationRequestId: subscription.verificationRequestId,
        amountInCents: event.data?.amount ?? 0,
        currency: event.data?.currency ?? "NGN",
        method: "CARD",
        status: PaymentStatus.SUCCESS,
        providerRef: reference,
        paidAt: new Date(),
      },
    });
  }

  const { verificationRequestId } = transaction;
  await prismaClient.$transaction(async (tx) => {
    await tx.transaction.updateMany({
      where: { id: transaction.id, status: { not: PaymentStatus.SUCCESS } },
      data: { status: PaymentStatus.SUCCESS, paidAt: new Date() },
    });
    await markRequestPaid(tx, verificationRequestId);
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

  if (paidTransaction) {
    appEvents.emit(AppEventTypes.PAYMENT_RECEIVED, {
      userId: paidTransaction.verificationRequest.user.id,
      email: paidTransaction.verificationRequest.user.email,
      firstName: paidTransaction.verificationRequest.user.fullName,
      amount: paidTransaction.amountInCents,
      reference: paidTransaction.providerRef ?? reference,
      payment_receipt: paidTransaction.providerRef ?? reference,
      booking_ref: paidTransaction.verificationRequestId,
      receipt_id: paidTransaction.id,
      currency: paidTransaction.currency,
      service_name: paidTransaction.verificationRequest.verificationPlan?.verificationType.name,
    });
  }

  logger.info(`Paystack transaction marked successful reference=${reference}`);
};

const handleChargeFailure = async (event: PaystackEvent) => {
  const reference = event.data?.reference;
  if (!reference) return;

  let transaction = await prismaClient.transaction.findFirst({
    where: { providerRef: reference },
  });

  if (!transaction) {
    const subscription = await findSubscriptionForCharge(event);
    if (!subscription) return;

    transaction = await prismaClient.transaction.create({
      data: {
        verificationRequestId: subscription.verificationRequestId,
        amountInCents: event.data?.amount ?? 0,
        currency: event.data?.currency ?? "NGN",
        method: "CARD",
        status: PaymentStatus.FAILED,
        providerRef: reference,
      },
    });
  }

  const { id: transactionId, verificationRequestId } = transaction;
  await prismaClient.$transaction(async (tx) => {
    await tx.transaction.updateMany({
      where: { id: transactionId, status: PaymentStatus.PENDING },
      data: { status: PaymentStatus.FAILED },
    });
    await markRequestPaymentFailed(tx, verificationRequestId);
  });
};

const handleSubscriptionCreated = async (event: PaystackEvent) => {
  const data = event.data;
  const subscriptionCode = getSubscriptionCode(event);
  const customerCode = data?.customer?.customer_code;
  const planCode = data?.plan?.plan_code;

  if (!subscriptionCode || !customerCode || !planCode) {
    logger.warn("Paystack subscription.create is missing subscription, customer, or plan data");
    return;
  }

  const user = await prismaClient.user.findUnique({
    where: { paystackCustomerCode: customerCode },
  });
  const plan = await prismaClient.verificationPlan.findUnique({
    where: { paystackPlanCode: planCode },
  });

  if (!user || !plan) {
    logger.warn(
      `Unable to map Paystack subscription=${subscriptionCode} customer=${customerCode} plan=${planCode}`,
    );
    return;
  }

  const existing = await prismaClient.paystackSubscription.findUnique({
    where: { subscriptionCode },
    select: { verificationRequestId: true },
  });

  // The request this subscription was bought for: the user's latest paid request on this plan
  // that doesn't have a subscription yet. A client with two requests on one plan therefore
  // gets one subscription per request.
  const transaction = existing
    ? { verificationRequestId: existing.verificationRequestId }
    : await prismaClient.transaction.findFirst({
        where: {
          status: PaymentStatus.SUCCESS,
          verificationRequest: {
            userId: user.id,
            verificationPlanId: plan.id,
            paystackSubscription: null,
          },
        },
        orderBy: { paidAt: "desc" },
        select: { verificationRequestId: true },
      });

  if (!transaction) {
    // Usually subscription.create arrived before the first charge.success. Fail so Paystack
    // retries; otherwise the subscription is never stored and every renewal is lost.
    throw new Error(`No paid request found yet for Paystack subscription=${subscriptionCode}`);
  }

  const parseDate = (value: unknown) => (typeof value === "string" ? new Date(value) : null);
  await prismaClient.paystackSubscription.upsert({
    where: { subscriptionCode },
    create: {
      userId: user.id,
      verificationRequestId: transaction.verificationRequestId,
      verificationPlanId: plan.id,
      customerCode,
      subscriptionCode,
      emailToken: data.email_token,
      nextPaymentDate: parseDate(data.next_payment_date),
      startedAt: parseDate(data.createdAt) || new Date(),
      status: "ACTIVE",
    },
    update: {
      emailToken: data.email_token,
      nextPaymentDate: parseDate(data.next_payment_date),
      status: "ACTIVE",
      disabledAt: null,
    },
  });
};

const handleSubscriptionStatusChange = async (event: PaystackEvent) => {
  const subscriptionCode = getSubscriptionCode(event);
  const status = event.event
    ? subscriptionStatusByEvent[event.event as keyof typeof subscriptionStatusByEvent]
    : undefined;
  if (!subscriptionCode || !status) {
    logger.warn(`Paystack ${event.event} missing subscription code`);
    return;
  }

  await prismaClient.paystackSubscription.updateMany({
    where: { subscriptionCode },
    data: {
      status,
      ...(status === "DISABLED" ? { disabledAt: new Date() } : {}),
      ...(typeof event.data?.next_payment_date === "string"
        ? { nextPaymentDate: new Date(event.data.next_payment_date) }
        : {}),
    },
  });

  const subscription = await prismaClient.paystackSubscription.findUnique({
    where: { subscriptionCode },
    select: { verificationRequestId: true },
  });
  if (!subscription) return;

  if (status === "PAYMENT_FAILED") {
    await markRequestPaymentFailed(prismaClient, subscription.verificationRequestId);
  } else {
    // NON_RENEWING or DISABLED: no more renewals will be charged.
    await completeRequestIfFinished(prismaClient, subscription.verificationRequestId);
  }
};

const handleExpiringCards = async (event: PaystackEvent) => {
  const customerCode = event.data?.customer?.customer_code;
  if (!customerCode) {
    logger.warn("Paystack subscription.expiring_cards did not include a customer code");
    return;
  }

  const user = await prismaClient.user.findUnique({
    where: { paystackCustomerCode: customerCode },
    select: { email: true, fullName: true },
  });
  if (!user) return;
};

export const paystackWebhook = async (req: Request, res: Response, _next: NextFunction) => {
  if (!verifySignature(req)) {
    logger.error("Paystack webhook signature verification failed");
    return res.sendStatus(400);
  }

  const event = req.body as PaystackEvent;
  const eventId = getEventId(event);
  const existingWebhook = await prismaClient.webhookEvent.findUnique({ where: { eventId } });

  if (existingWebhook?.processed) {
    return res.json({ received: true });
  }

  await prismaClient.webhookEvent.upsert({
    where: { eventId },
    create: {
      integration: "paystack",
      eventId,
      data: event as Prisma.InputJsonValue,
      verified: true,
    },
    update: { data: event as Prisma.InputJsonValue, verified: true },
  });

  try {
    switch (event.event) {
      case "charge.success":
        await handleChargeSuccess(event);
        break;
      case "charge.failed":
      case "charge.abandoned":
        await handleChargeFailure(event);
        break;
      case "subscription.create":
        await handleSubscriptionCreated(event);
        break;
      case "invoice.payment_failed":
      case "subscription.not_renew":
      case "subscription.disable":
        await handleSubscriptionStatusChange(event);
        break;
      case "subscription.expiring_cards":
        await handleExpiringCards(event);
        break;
      case "invoice.create":
        logger.info("Paystack invoice.create received");
        break;
      default:
        logger.info(`Ignoring unsupported Paystack event=${event.event}`);
    }

    await prismaClient.webhookEvent.update({ where: { eventId }, data: { processed: true } });
    return res.sendStatus(200);
  } catch (error) {
    logger.error(`Error handling Paystack event=${event.event} eventId=${eventId}: ${error}`);
    return res.sendStatus(500);
  }
};

export const callback_url = async (req: Request, res: Response) => {
  const reference = req.query.reference as string;

  if (!reference) {
    return res.status(400).json({ error: "Reference not provided" });
  }

  const transaction = await prismaClient.transaction.findFirst({
    where: { providerRef: reference },
  });
  if (!transaction) {
    return res.status(404).json({ error: "Transaction not found" });
  }

  return res.status(200).json({
    message: "Payment received. Webhook processing will update the verification request.",
    reference,
    status: transaction.status,
  });
};
