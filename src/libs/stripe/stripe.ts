import { getStripeClient } from "./index";
import { PaymentMetadata } from "../../types/paystack";

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
  const clientUrl = process.env.CLIENT_URL;

  if (!clientUrl) throw new Error("CLIENT_URL is required");
  if (!priceId) throw new Error("STRIPE_PRICE_ID is required");
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new Error("quantity must be a positive integer");
  }

  const session = await getStripeClient().checkout.sessions.create({
    success_url: clientUrl,
    cancel_url: clientUrl,
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
  const clientUrl = process.env.CLIENT_URL;
  if (!clientUrl) throw new Error("CLIENT_URL is required");

  const session = await getStripeClient().checkout.sessions.create({
    mode: "payment",
    success_url: clientUrl,
    cancel_url: clientUrl,
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
