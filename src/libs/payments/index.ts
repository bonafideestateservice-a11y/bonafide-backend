import { logger } from "../../utils/logger";

export interface PaymentIntent {
  amount: number;
  currency: string;
  reference: string;
}

export const createPayment = async (payment: PaymentIntent) => {
  // TODO: integrate with a payment gateway (e.g. Stripe, Paystack, Flutterwave)
  logger.info(`[payments] create ${payment.reference} (${payment.amount} ${payment.currency})`);

  return { ...payment, status: "pending" };
};