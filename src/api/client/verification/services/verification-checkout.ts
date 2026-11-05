import { PaymentProvider, PaymentStatus, VerificationStatus } from "@prisma/client";
import { createPaystackCustomer, createPaystackSession } from "../../../../libs/paystack/paystack";
import { createStripeSession } from "../../../../libs/stripe/stripe";
import { logger } from "../../../../utils/logger";
import { prismaClient } from "../../../../utils/prisma";
import {
  createVerificationCheckoutTransactionData,
  findVerificationCheckoutPricing,
  reservePricedTransaction,
} from "../../../services/database/pricing";

const payableStatuses: VerificationStatus[] = [
  VerificationStatus.DRAFT,
  VerificationStatus.PENDING_PAYMENT,
  VerificationStatus.PAYMENT_FAILED,
];

export interface VerificationCheckout {
  provider: PaymentProvider;
  transactionId: string;
  checkoutUrl: string;
  reference: string;
  sessionId?: string;
  accessCode?: string;
  pricing: Awaited<ReturnType<typeof findVerificationCheckoutPricing>>;
}

export const createStripeVerificationCheckout = async (
  verificationRequestId: string,
  userId: string,
): Promise<VerificationCheckout> => {
  let transactionId: string | undefined;
  try {
    const pricing = await findVerificationCheckoutPricing({
      requestId: verificationRequestId,
      userId,
      provider: PaymentProvider.STRIPE,
    });
    const tier = pricing.request.verificationTier;
    if (!tier) throw new Error("Verification tier is unavailable");

    const reservation = await reservePricedTransaction(
      createVerificationCheckoutTransactionData(pricing),
    );
    const transaction = reservation.transaction;
    transactionId = transaction.id;
    if (reservation.reused) {
      if (!transaction.providerRef || !transaction.authorizationUrl) {
        throw new Error(`Reusable Stripe checkout is incomplete transactionId=${transaction.id}`);
      }
      return {
        provider: PaymentProvider.STRIPE,
        transactionId: transaction.id,
        checkoutUrl: transaction.authorizationUrl,
        reference: transaction.providerRef,
        sessionId: transaction.providerRef,
        pricing,
      };
    }

    if (pricing.request.monitoringPlan && !pricing.monitoringPriceVersion?.providerPriceId) {
      throw new Error("Stripe monitoring price is unavailable");
    }
    const lineItems = [
      ...(pricing.tierPriceVersion?.providerPriceId
        ? [{ price: pricing.tierPriceVersion.providerPriceId, quantity: 1 }]
        : [
            {
              quantity: 1,
              price_data: {
                currency: "usd",
                unit_amount: pricing.verificationAmountUsdCents,
                product_data: { name: tier.name },
              },
            },
          ]),
      ...(pricing.monitoringPriceVersion?.providerPriceId
        ? [{ price: pricing.monitoringPriceVersion.providerPriceId, quantity: 1 }]
        : []),
    ];
    const session = await createStripeSession({
      lineItems,
      mode: pricing.request.monitoringPlan ? "subscription" : "payment",
      metadata: {
        userId,
        verificationRequestId,
        transactionId,
        description: `Stripe transaction by user ${userId}`,
      },
    });
    if (!session.id || !session.url) {
      throw new Error("Stripe returned an invalid checkout session");
    }

    await prismaClient.$transaction([
      prismaClient.transaction.update({
        where: { id: transactionId },
        data: { providerRef: session.id, authorizationUrl: session.url },
      }),
      prismaClient.verificationRequest.updateMany({
        where: { id: verificationRequestId, status: { in: payableStatuses } },
        data: { status: VerificationStatus.PENDING_PAYMENT },
      }),
    ]);

    return {
      provider: PaymentProvider.STRIPE,
      transactionId,
      checkoutUrl: session.url,
      reference: session.id,
      sessionId: session.id,
      pricing,
    };
  } catch (error) {
    if (transactionId) {
      await prismaClient.transaction.updateMany({
        where: { id: transactionId, status: PaymentStatus.PENDING, providerRef: null },
        data: { status: PaymentStatus.FAILED },
      });
    }
    logger.error(
      `Error initializing Stripe verification checkout requestId=${verificationRequestId}: ${error}`,
    );
    throw error;
  }
};

export const createPaystackVerificationCheckout = async (
  verificationRequestId: string,
  userId: string,
): Promise<VerificationCheckout> => {
  let transactionId: string | undefined;
  try {
    const pricing = await findVerificationCheckoutPricing({
      requestId: verificationRequestId,
      userId,
      provider: PaymentProvider.PAYSTACK,
    });
    const reservation = await reservePricedTransaction(
      createVerificationCheckoutTransactionData(pricing),
    );
    const transaction = reservation.transaction;
    transactionId = transaction.id;
    if (reservation.reused) {
      if (!transaction.providerRef || !transaction.authorizationUrl || !transaction.accessCode) {
        throw new Error(`Reusable Paystack checkout is incomplete transactionId=${transaction.id}`);
      }
      return {
        provider: PaymentProvider.PAYSTACK,
        transactionId: transaction.id,
        checkoutUrl: transaction.authorizationUrl,
        reference: transaction.providerRef,
        accessCode: transaction.accessCode,
        pricing,
      };
    }

    if (pricing.request.monitoringPlan && !pricing.monitoringPriceVersion?.providerPriceId) {
      throw new Error("Paystack monitoring plan is unavailable");
    }
    let customerCode = pricing.request.user.paystackCustomerCode;
    if (!customerCode) {
      const customer = await createPaystackCustomer(pricing.request.user.email);
      customerCode = customer.customer_code;
      if (!customerCode) throw new Error("Paystack customer code was not returned");
      await prismaClient.user.update({
        where: { id: userId },
        data: { paystackCustomerCode: customerCode },
      });
    }

    const session = await createPaystackSession({
      userId,
      email: pricing.request.user.email,
      customer: customerCode,
      plan: pricing.monitoringPriceVersion?.providerPriceId ?? undefined,
      amount: pricing.amountMinor,
      currency: pricing.currency,
      paymentMethod: "CARD",
      verificationRequestId,
      transactionId,
    });
    if (!session?.reference || !session.authorization_url || !session.access_code) {
      throw new Error("Paystack returned an invalid transaction session");
    }

    await prismaClient.$transaction([
      prismaClient.transaction.update({
        where: { id: transactionId },
        data: {
          providerRef: session.reference,
          authorizationUrl: session.authorization_url,
          accessCode: session.access_code,
        },
      }),
      prismaClient.verificationRequest.updateMany({
        where: { id: verificationRequestId, status: { in: payableStatuses } },
        data: { status: VerificationStatus.PENDING_PAYMENT },
      }),
    ]);

    return {
      provider: PaymentProvider.PAYSTACK,
      transactionId,
      checkoutUrl: session.authorization_url,
      reference: session.reference,
      accessCode: session.access_code,
      pricing,
    };
  } catch (error) {
    if (transactionId) {
      await prismaClient.transaction.updateMany({
        where: { id: transactionId, status: PaymentStatus.PENDING, providerRef: null },
        data: { status: PaymentStatus.FAILED },
      });
    }
    logger.error(
      `Error initializing Paystack verification checkout requestId=${verificationRequestId}: ${error}`,
    );
    throw error;
  }
};
