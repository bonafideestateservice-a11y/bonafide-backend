import { NextFunction, Request, Response } from "express";
import crypto from "crypto";
import {
  MonitoringInterval,
  MonitoringSubscriptionStatus,
  MonitoringSubscription,
  PaymentProvider,
  PaymentStatus,
  Prisma,
} from "@prisma/client";
import {
  markPropertyPaymentFailed,
  markPropertyPaymentSuccessful,
} from "../services/database/property-request";
import { logger } from "../../utils/logger";
import { paymentPages, withQuery } from "../../utils/payment-pages";
import { verifyPaystackTransaction } from "../../libs/paystack/paystack";
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

const paystackDate = (value: string | undefined) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const addMonitoringInterval = (
  start: Date,
  interval: MonitoringInterval,
  intervalCount: number,
) => {
  const end = new Date(start);
  if (interval === MonitoringInterval.WEEKLY) {
    end.setUTCDate(end.getUTCDate() + 7 * intervalCount);
    return end;
  }
  const months = interval === MonitoringInterval.QUARTERLY ? 3 * intervalCount : intervalCount;
  const day = end.getUTCDate();
  end.setUTCDate(1);
  end.setUTCMonth(end.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  end.setUTCDate(Math.min(day, lastDay));
  return end;
};

const findMonitoringSubscriptionForCharge = async (event: PaystackEvent) => {
  const subscriptionCode = getSubscriptionCode(event);
  if (subscriptionCode) {
    return prismaClient.monitoringSubscription.findUnique({
      where: {
        provider_providerSubscriptionId: {
          provider: PaymentProvider.PAYSTACK,
          providerSubscriptionId: subscriptionCode,
        },
      },
    });
  }

  const customerCode = getCustomerCode(event);
  const planCode = getPlanCode(event);
  if (!customerCode || !planCode) return null;
  const candidates = await prismaClient.monitoringSubscription.findMany({
    where: {
      provider: PaymentProvider.PAYSTACK,
      customerCode,
      status: { in: ["ACTIVE", "NON_RENEWING", "PAYMENT_FAILED"] },
      providerPriceVersion: { is: { providerPriceId: planCode } },
    },
  });
  if (candidates.length <= 1) return candidates[0] ?? null;

  const chargedAt = paystackDate(event.data?.paid_at)?.getTime() ?? Date.now();
  const distance = (date: Date | null) =>
    date ? Math.abs(date.getTime() - chargedAt) : Number.POSITIVE_INFINITY;
  const [closest] = [...candidates].sort(
    (a, b) =>
      distance(a.currentPeriodEnd) - distance(b.currentPeriodEnd) ||
      Number(b.status === "ACTIVE") - Number(a.status === "ACTIVE"),
  );
  logger.warn(
    `Paystack charge matched ${candidates.length} monitoring subscriptions for customer=${customerCode} plan=${planCode}; using subscription=${closest.providerSubscriptionId}`,
  );
  return closest;
};

const renewalSnapshot = (subscription: MonitoringSubscription, amountMinor: number) => {
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
    throw new Error(
      `Paystack monitoring terms are incomplete subscriptionId=${subscription.providerSubscriptionId}`,
    );
  }
  return createMonitoringRenewalSnapshot({
    provider: PaymentProvider.PAYSTACK,
    currency: "NGN",
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
    where: {
      customerCode,
      verificationPlan: {
        OR: [{ paystackPlanCode: planCode }, { paystackNgnPlanCode: planCode }],
      },
    },
  });
  if (candidates.length <= 1) return candidates[0] ?? null;

  const chargedAt = event.data?.paid_at ? new Date(event.data.paid_at).getTime() : Date.now();
  const distance = (date: Date | null) =>
    date ? Math.abs(date.getTime() - chargedAt) : Number.POSITIVE_INFINITY;
  const [closest] = [...candidates].sort(
    (a, b) =>
      distance(a.nextPaymentDate) - distance(b.nextPaymentDate) ||
      Number(b.status === "ACTIVE") - Number(a.status === "ACTIVE"),
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

/** The property payment a charge is for, from the metadata set when its checkout started. */
const propertyPaymentIdOf = (event: PaystackEvent) => {
  let metadata = event.data?.metadata;
  if (typeof metadata === "string") {
    try {
      metadata = JSON.parse(metadata);
    } catch {
      return undefined;
    }
  }
  const { kind, propertyPaymentId } = (metadata ?? {}) as Record<string, unknown>;
  return kind === "property_payment" && typeof propertyPaymentId === "string"
    ? propertyPaymentId
    : undefined;
};

const handleChargeSuccess = async (event: PaystackEvent) => {
  const reference = event.data?.reference;
  if (!reference) {
    logger.warn("Paystack charge.success did not include a reference");
    return;
  }

  const propertyPaymentId = propertyPaymentIdOf(event);
  if (propertyPaymentId) {
    await markPropertyPaymentSuccessful(propertyPaymentId, {
      provider: PaymentProvider.PAYSTACK,
      providerRef: reference,
      amount: Number(event.data?.amount ?? 0),
      currency: String(event.data?.currency ?? "NGN"),
    });
    return;
  }

  let transaction = await prismaClient.transaction.findFirst({
    where: { providerRef: reference },
  });
  let monitoringSubscription: MonitoringSubscription | null = null;
  let period: { periodStart: Date; periodEnd: Date } | null = null;

  if (!transaction) {
    monitoringSubscription = await findMonitoringSubscriptionForCharge(event);
    if (monitoringSubscription) {
      const amountInCents = Number(event.data?.amount ?? 0);
      const paidAt = paystackDate(event.data?.paid_at) ?? new Date();
      const periodStart = monitoringSubscription.currentPeriodEnd ?? paidAt;
      const periodEndFromProvider = paystackDate(event.data?.next_payment_date);
      const periodEnd =
        periodEndFromProvider && periodEndFromProvider > periodStart
          ? periodEndFromProvider
          : monitoringSubscription.interval && monitoringSubscription.intervalCount
            ? addMonitoringInterval(
                periodStart,
                monitoringSubscription.interval,
                monitoringSubscription.intervalCount,
              )
            : null;
      if (!periodEnd) {
        throw new Error(
          `Paystack renewal period is missing subscription=${monitoringSubscription.providerSubscriptionId}`,
        );
      }
      period = { periodStart, periodEnd };
      const snapshot = renewalSnapshot(monitoringSubscription, amountInCents);
      transaction = await prismaClient.transaction.upsert({
        where: { providerRef: reference },
        create: {
          verificationRequestId: monitoringSubscription.verificationRequestId,
          amountInCents,
          currency: "NGN",
          method: "CARD",
          provider: PaymentProvider.PAYSTACK,
          purpose: "RENEWAL",
          providerPriceVersionId: monitoringSubscription.providerPriceVersionId,
          monitoringAmountUsdCents: monitoringSubscription.priceUsdCents,
          totalUsdCents: monitoringSubscription.priceUsdCents,
          pricingSnapshot: snapshot,
          status: PaymentStatus.PENDING,
          providerRef: reference,
          paidAt,
        },
        update: {
          amountInCents,
          currency: "NGN",
          provider: PaymentProvider.PAYSTACK,
          purpose: "RENEWAL",
          providerPriceVersionId: monitoringSubscription.providerPriceVersionId,
          monitoringAmountUsdCents: monitoringSubscription.priceUsdCents,
          totalUsdCents: monitoringSubscription.priceUsdCents,
          pricingSnapshot: snapshot,
          paidAt,
        },
      });
    } else {
      // No transaction with this reference: a legacy subscription renewal.
      const subscription = await findSubscriptionForCharge(event);
      if (!subscription) {
        if (getPlanCode(event)) {
          throw new Error(`No subscription stored yet for Paystack renewal reference=${reference}`);
        }
        logger.warn(`Paystack transaction not found reference=${reference}`);
        return;
      }

      transaction = await prismaClient.transaction.upsert({
        where: { providerRef: reference },
        create: {
          verificationRequestId: subscription.verificationRequestId,
          amountInCents: Number(event.data?.amount ?? 0),
          currency: String(event.data?.currency ?? "NGN").toUpperCase(),
          method: "CARD",
          status: PaymentStatus.PENDING,
          providerRef: reference,
          paidAt: paystackDate(event.data?.paid_at),
        },
        update: {},
      });
    }
  } else if (
    transaction.provider === PaymentProvider.PAYSTACK &&
    transaction.purpose === "RENEWAL"
  ) {
    monitoringSubscription = await findMonitoringSubscriptionForCharge(event);
    if (!monitoringSubscription) {
      throw new Error(`Paystack monitoring subscription not found reference=${reference}`);
    }
    const paidAt = paystackDate(event.data?.paid_at) ?? transaction.paidAt ?? new Date();
    const periodStart = monitoringSubscription.currentPeriodEnd ?? paidAt;
    const periodEndFromProvider = paystackDate(event.data?.next_payment_date);
    const periodEnd =
      periodEndFromProvider && periodEndFromProvider > periodStart
        ? periodEndFromProvider
        : monitoringSubscription.interval && monitoringSubscription.intervalCount
          ? addMonitoringInterval(
              periodStart,
              monitoringSubscription.interval,
              monitoringSubscription.intervalCount,
            )
          : null;
    if (!periodEnd) {
      throw new Error(
        `Paystack renewal period is missing subscription=${monitoringSubscription.providerSubscriptionId}`,
      );
    }
    period = { periodStart, periodEnd };
  }

  const amount = Number(event.data?.amount ?? transaction.amountInCents);
  const currency = String(event.data?.currency ?? transaction.currency).toUpperCase();
  if (amount !== transaction.amountInCents || currency !== transaction.currency.toUpperCase()) {
    throw new Error(`Paystack charge amount does not match transaction reference=${reference}`);
  }

  const { verificationRequestId } = transaction;
  const newlyPaid = await prismaClient.$transaction(async (tx) => {
    const updated = await tx.transaction.updateMany({
      where: { id: transaction.id, status: { not: PaymentStatus.SUCCESS } },
      data: {
        status: PaymentStatus.SUCCESS,
        paidAt: paystackDate(event.data?.paid_at) ?? new Date(),
      },
    });
    await markRequestPaid(tx, verificationRequestId);
    return updated.count > 0;
  });

  if (monitoringSubscription && period) {
    await activateMonitoringForPaidTransaction({
      transactionId: transaction.id,
      provider: PaymentProvider.PAYSTACK,
      providerSubscriptionId: monitoringSubscription.providerSubscriptionId ?? "",
      customerCode: monitoringSubscription.customerCode ?? undefined,
      emailToken: monitoringSubscription.emailToken ?? undefined,
      startedAt: period.periodStart,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
    });
  }

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

  if (paidTransaction && newlyPaid) {
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

  const propertyPaymentId = propertyPaymentIdOf(event);
  if (propertyPaymentId) {
    await markPropertyPaymentFailed(propertyPaymentId, reference);
    return;
  }

  let transaction = await prismaClient.transaction.findFirst({
    where: { providerRef: reference },
  });

  if (!transaction) {
    const monitoringSubscription = await findMonitoringSubscriptionForCharge(event);
    if (monitoringSubscription) {
      const amountInCents = Number(event.data?.amount ?? 0);
      await recordFailedRenewal({
        verificationRequestId: monitoringSubscription.verificationRequestId,
        providerRef: reference,
        amountInCents,
        currency: String(event.data?.currency ?? "NGN").toUpperCase(),
        provider: PaymentProvider.PAYSTACK,
        providerPriceVersionId: monitoringSubscription.providerPriceVersionId ?? undefined,
        pricingSnapshot: renewalSnapshot(monitoringSubscription, amountInCents),
      });
      return;
    }

    const subscription = await findSubscriptionForCharge(event);
    if (!subscription) return;

    transaction = await prismaClient.transaction.create({
      data: {
        verificationRequestId: subscription.verificationRequestId,
        amountInCents: Number(event.data?.amount ?? 0),
        currency: String(event.data?.currency ?? "NGN").toUpperCase(),
        method: "CARD",
        status: PaymentStatus.FAILED,
        providerRef: reference,
      },
    });
  }

  const { id: transactionId, verificationRequestId } = transaction;
  const result = await prismaClient.$transaction(async (tx) => {
    await tx.transaction.updateMany({
      where: { id: transactionId, status: PaymentStatus.PENDING },
      data: { status: PaymentStatus.FAILED },
    });
    return markRequestPaymentFailed(tx, verificationRequestId);
  });
  announcePaymentFailed(result, verificationRequestId);
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

  const providerPriceVersion = await prismaClient.providerPriceVersion.findFirst({
    where: {
      provider: PaymentProvider.PAYSTACK,
      providerPriceId: planCode,
      monitoringPlanId: { not: null },
      syncStatus: "READY",
    },
  });
  if (providerPriceVersion?.monitoringPlanId) {
    const user = await prismaClient.user.findUnique({
      where: { paystackCustomerCode: customerCode },
      select: { id: true },
    });
    if (!user) {
      throw new Error(
        `Paystack customer not found for monitoring subscription=${subscriptionCode}`,
      );
    }

    const existing = await prismaClient.monitoringSubscription.findUnique({
      where: {
        provider_providerSubscriptionId: {
          provider: PaymentProvider.PAYSTACK,
          providerSubscriptionId: subscriptionCode,
        },
      },
    });
    const transaction = await prismaClient.transaction.findFirst({
      where: {
        status: PaymentStatus.SUCCESS,
        provider: PaymentProvider.PAYSTACK,
        providerPriceVersionId: providerPriceVersion.id,
        verificationRequest: existing
          ? { id: existing.verificationRequestId, userId: user.id }
          : {
              userId: user.id,
              monitoringPlanId: providerPriceVersion.monitoringPlanId,
              recurringConsent: true,
              monitoringSubscriptions: { none: {} },
            },
      },
      orderBy: { paidAt: "desc" },
    });
    if (!transaction) {
      throw new Error(`No paid transaction found for Paystack subscription=${subscriptionCode}`);
    }

    const periodStart = transaction.paidAt ?? paystackDate(data?.createdAt) ?? new Date();
    const periodEnd = paystackDate(data?.next_payment_date);
    if (!periodEnd || periodEnd <= periodStart) {
      throw new Error(`Paystack subscription period is invalid subscription=${subscriptionCode}`);
    }
    await activateMonitoringForPaidTransaction({
      transactionId: transaction.id,
      provider: PaymentProvider.PAYSTACK,
      providerSubscriptionId: subscriptionCode,
      customerCode,
      emailToken: data?.email_token,
      startedAt: paystackDate(data?.createdAt) ?? periodStart,
      periodStart,
      periodEnd,
    });
    return;
  }

  const user = await prismaClient.user.findUnique({
    where: { paystackCustomerCode: customerCode },
  });
  const plan = await prismaClient.verificationPlan.findFirst({
    where: { OR: [{ paystackPlanCode: planCode }, { paystackNgnPlanCode: planCode }] },
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

  const monitoringSubscription = await prismaClient.monitoringSubscription.findUnique({
    where: {
      provider_providerSubscriptionId: {
        provider: PaymentProvider.PAYSTACK,
        providerSubscriptionId: subscriptionCode,
      },
    },
  });
  if (monitoringSubscription) {
    const previousStatus = monitoringSubscription.status;
    const terminalStatuses: MonitoringSubscriptionStatus[] = [
      MonitoringSubscriptionStatus.DISABLED,
      MonitoringSubscriptionStatus.EXPIRED,
    ];
    const nextPaymentDate = paystackDate(event.data?.next_payment_date);
    await prismaClient.monitoringSubscription.updateMany({
      where: {
        provider: PaymentProvider.PAYSTACK,
        providerSubscriptionId: subscriptionCode,
        ...(status === "PAYMENT_FAILED"
          ? {
              status: {
                in: [
                  MonitoringSubscriptionStatus.ACTIVE,
                  MonitoringSubscriptionStatus.PAYMENT_FAILED,
                ],
              },
            }
          : status === "NON_RENEWING"
            ? {
                status: {
                  in: [
                    MonitoringSubscriptionStatus.ACTIVE,
                    MonitoringSubscriptionStatus.PAYMENT_FAILED,
                    MonitoringSubscriptionStatus.NON_RENEWING,
                  ],
                },
              }
            : { status: { notIn: terminalStatuses } }),
      },
      data: {
        status,
        ...(status === "DISABLED" ? { disabledAt: new Date() } : {}),
        ...(nextPaymentDate ? { currentPeriodEnd: nextPaymentDate } : {}),
      },
    });

    const invoiceCode = event.data?.invoice_code;
    if (status === "PAYMENT_FAILED" && invoiceCode) {
      const amountInCents = Number(event.data?.amount ?? 0);
      await recordFailedRenewal({
        verificationRequestId: monitoringSubscription.verificationRequestId,
        providerRef: invoiceCode,
        amountInCents,
        currency: String(event.data?.currency ?? "NGN").toUpperCase(),
        provider: PaymentProvider.PAYSTACK,
        providerPriceVersionId: monitoringSubscription.providerPriceVersionId ?? undefined,
        pricingSnapshot: renewalSnapshot(monitoringSubscription, amountInCents),
      });
    } else if (status === "PAYMENT_FAILED") {
      announcePaymentFailed(
        await markRequestPaymentFailed(prismaClient, monitoringSubscription.verificationRequestId),
        monitoringSubscription.verificationRequestId,
      );
    } else {
      await completeRequestIfFinished(prismaClient, monitoringSubscription.verificationRequestId);
      if (
        !terminalStatuses.includes(previousStatus) &&
        previousStatus !== MonitoringSubscriptionStatus.NON_RENEWING
      ) {
        announceSubscriptionEnded(monitoringSubscription.verificationRequestId);
      }
    }
    return;
  }

  const subscription = await prismaClient.paystackSubscription.findUnique({
    where: { subscriptionCode },
    select: { verificationRequestId: true, status: true },
  });
  if (!subscription) return;

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

  const invoiceCode = event.data?.invoice_code;
  if (status === "PAYMENT_FAILED" && invoiceCode) {
    await recordFailedRenewal({
      verificationRequestId: subscription.verificationRequestId,
      providerRef: invoiceCode,
      amountInCents: Number(event.data?.amount ?? 0),
      currency: String(event.data?.currency ?? "NGN"),
    });
  } else if (status === "PAYMENT_FAILED") {
    announcePaymentFailed(
      await markRequestPaymentFailed(prismaClient, subscription.verificationRequestId),
      subscription.verificationRequestId,
    );
  } else {
    // NON_RENEWING or DISABLED: no more renewals will be charged.
    await completeRequestIfFinished(prismaClient, subscription.verificationRequestId);
    // Paystack sends not_renew, then disable at period end: only the first tells the client.
    if (subscription.status !== "NON_RENEWING" && subscription.status !== "DISABLED") {
      announceSubscriptionEnded(subscription.verificationRequestId);
    }
  }
};

/**
 * invoice.create (before each renewal) and invoice.update (after it is charged) carry the
 * subscription's next payment date. Keeping it current lets findSubscriptionForCharge pick the
 * right subscription when a customer has two on the same plan.
 */
const handleInvoice = async (event: PaystackEvent) => {
  const subscriptionCode = getSubscriptionCode(event);
  const subscription = event.data?.subscription as { next_payment_date?: unknown } | undefined;
  const nextPaymentDate = subscription?.next_payment_date;
  if (!subscriptionCode || typeof nextPaymentDate !== "string") return;

  const parsedNextPaymentDate = paystackDate(nextPaymentDate);
  if (!parsedNextPaymentDate) {
    logger.warn(
      `Paystack invoice has an invalid next payment date subscription=${subscriptionCode}`,
    );
    return;
  }
  await prismaClient.monitoringSubscription.updateMany({
    where: {
      provider: PaymentProvider.PAYSTACK,
      providerSubscriptionId: subscriptionCode,
    },
    data: { currentPeriodEnd: parsedNextPaymentDate },
  });
  await prismaClient.paystackSubscription.updateMany({
    where: { subscriptionCode },
    data: { nextPaymentDate: parsedNextPaymentDate },
  });
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
      case "invoice.update":
        await handleInvoice(event);
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

/**
 * Paystack sends the customer here after a checkout, with ?reference=. Paystack has one callback
 * for every outcome, so ask it how the charge went and redirect to the frontend's success or
 * failure page. Only for display: the webhook records the payment.
 */
export const callback_url = async (req: Request, res: Response) => {
  const { success, failure } = paymentPages();
  if (!success || !failure) {
    logger.error(
      "PAYMENT_SUCCESS_URL and PAYMENT_FAILURE_URL must be set for the Paystack callback",
    );
    return res.status(500).json({ error: "Payment pages are not configured" });
  }

  const reference = typeof req.query.reference === "string" ? req.query.reference.trim() : "";
  if (!reference) return res.redirect(302, failure);

  let paid = false;
  try {
    paid = (await verifyPaystackTransaction(reference)).status === "success";
  } catch (error) {
    logger.warn(`Could not verify Paystack reference=${reference}: ${error}`);
  }
  const page = paid ? success : failure;
  return res.redirect(302, withQuery(page, "reference", encodeURIComponent(reference)));
};
