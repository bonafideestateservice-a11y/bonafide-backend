import { NextFunction, Request, Response } from "express";
import crypto from "crypto";
import { PaymentStatus, Prisma, VerificationStatus } from "@prisma/client";
import { logger } from "../../utils/logger";
import { prismaClient } from "../../utils/prisma";


type PaystackEvent = {
  event?: string;
  data?: {
    id?: string | number;
    reference?: string;
    amount?: number;
    currency?: string;
    subscription_code?: string;
    email_token?: string;
    customer?: { customer_code?: string; email?: string };
    plan?: { plan_code?: string };
    next_payment_date?: string;
    createdAt?: string;
    [key: string]: unknown;
  };
};

const subscriptionStatusByEvent = {
  "invoice.payment_failed": "PAYMENT_FAILED",
  "subscription.not_renew": "NON_RENEWING",
  "subscription.disable": "DISABLED",
} as const;

const getEventId = (event: PaystackEvent) =>
  String(
    event.data?.reference ??
      event.data?.subscription_code ??
      event.data?.id ??
      `paystack-${Date.now()}-${crypto.randomUUID()}`,
  );

const getSubscriptionCode = (event: PaystackEvent) =>
  event.data?.subscription_code ??
  (typeof event.data?.subscription === "object" && event.data.subscription
    ? (event.data.subscription as { subscription_code?: string }).subscription_code
    : undefined);

const getCustomerCode = (event: PaystackEvent) => event.data?.customer?.customer_code;

const getPlanCode = (event: PaystackEvent) => event.data?.plan?.plan_code;

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
    const subscriptionCode = getSubscriptionCode(event);
    const customerCode = getCustomerCode(event);
    const planCode = getPlanCode(event);
    const subscription = subscriptionCode
      ? await prismaClient.paystackSubscription.findUnique({ where: { subscriptionCode } })
      : customerCode && planCode
        ? await prismaClient.paystackSubscription.findFirst({
            where: { customerCode, verificationPlan: { paystackPlanCode: planCode } },
          })
        : null;

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

  await prismaClient.$transaction([
    prismaClient.transaction.updateMany({
      where: { id: transaction.id, status: { not: PaymentStatus.SUCCESS } },
      data: { status: PaymentStatus.SUCCESS, paidAt: new Date() },
    }),
    prismaClient.verificationRequest.updateMany({
      where: {
        id: transaction.verificationRequestId,
        status: { notIn: [VerificationStatus.COMPLETED, VerificationStatus.CANCELLED] },
      },
      data: { status: VerificationStatus.SUBMITTED },
    }),
  ]);

  logger.info(`Paystack transaction marked successful reference=${reference}`);
};

const handleChargeFailure = async (event: PaystackEvent) => {
  const reference = event.data?.reference;
  if (!reference) return;

  let transaction = await prismaClient.transaction.findFirst({
    where: { providerRef: reference },
  });

  if (!transaction) {
    const subscriptionCode = getSubscriptionCode(event);
    const customerCode = getCustomerCode(event);
    const planCode = getPlanCode(event);
    const subscription = subscriptionCode
      ? await prismaClient.paystackSubscription.findUnique({ where: { subscriptionCode } })
      : customerCode && planCode
        ? await prismaClient.paystackSubscription.findFirst({
            where: { customerCode, verificationPlan: { paystackPlanCode: planCode } },
          })
        : null;
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

  await prismaClient.$transaction([
    prismaClient.transaction.updateMany({
      where: { id: transaction.id, status: PaymentStatus.PENDING },
      data: { status: PaymentStatus.FAILED },
    }),
    prismaClient.verificationRequest.updateMany({
      where: {
        id: transaction.verificationRequestId,
        status: VerificationStatus.PENDING_PAYMENT,
      },
      data: { status: VerificationStatus.PAYMENT_FAILED },
    }),
  ]);
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

  const transaction = await prismaClient.transaction.findFirst({
    where: {
      status: PaymentStatus.SUCCESS,
      verificationRequest: { userId: user.id, verificationPlanId: plan.id },
    },
    orderBy: { paidAt: "desc" },
  });

  if (!transaction) {
    logger.warn(`No successful transaction found for Paystack subscription=${subscriptionCode}`);
    return;
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

  if (status === "PAYMENT_FAILED") {
    const subscription = await prismaClient.paystackSubscription.findUnique({
      where: { subscriptionCode },
    });
    if (subscription) {
      await prismaClient.verificationRequest.updateMany({
        where: {
          id: subscription.verificationRequestId,
          status: { notIn: [VerificationStatus.COMPLETED, VerificationStatus.CANCELLED] },
        },
        data: { status: VerificationStatus.PAYMENT_FAILED },
      });
    }
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
