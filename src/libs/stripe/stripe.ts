import { getStripeClient } from "./index";
import { PaymentMetadata } from "../../types/paystack";
import { paymentPages, withQuery } from "../../utils/payment-pages";

/**
 * Stripe Checkout requires a success URL. Stripe fills in {CHECKOUT_SESSION_ID}. A declined card
 * stays on Stripe's page, so the failure page is only reached when the customer cancels.
 */
const checkoutRedirects = () => {
  const { success, failure } = paymentPages();
  if (!success) throw new Error("PAYMENT_SUCCESS_URL is required");
  return {
    // Not encoded: Stripe only replaces the placeholder written exactly like this.
    success_url: withQuery(success, "session_id", "{CHECKOUT_SESSION_ID}"),
    ...(failure ? { cancel_url: failure } : {}),
  };
};

export interface CreatePaymentSessionParams {
  quantity?: number;
  priceId?: string;
  mode: "payment" | "subscription";
  metadata: PaymentMetadata;
}

export async function createStripeSession({
  quantity = 1,
  priceId = process.env.STRIPE_PRICE_ID,
  mode,
  metadata,
}: CreatePaymentSessionParams) {
  if (!priceId) throw new Error("STRIPE_PRICE_ID is required");
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new Error("quantity must be a positive integer");
  }

  const session = await getStripeClient().checkout.sessions.create({
    ...checkoutRedirects(),
    line_items: [{ price: priceId, quantity }],
    mode,
    metadata: { ...metadata },
    ...(mode === "subscription" ? { subscription_data: { metadata: { ...metadata } } } : {}),
  });

  return session.url;
}

/** Stripe's largest single charge: 99,999,999 in the currency's smallest unit. */
export const STRIPE_MAX_AMOUNT = 99_999_999;

/** A one-off Stripe Checkout for a fixed amount, e.g. a property payment. */
export async function createStripeCheckout({
  amount,
  currency,
  name,
  metadata,
}: {
  amount: number;
  currency: string;
  name: string;
  metadata: Record<string, string>;
}) {
  const session = await getStripeClient().checkout.sessions.create({
    mode: "payment",
    ...checkoutRedirects(),
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: currency.toLowerCase(),
          unit_amount: amount,
          product_data: { name },
        },
      },
    ],
    metadata,
  });
  return { id: session.id, url: session.url };
}
