import { stripe } from "./index";
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

  const session = await stripe.checkout.sessions.create({
    success_url: clientUrl,
    cancel_url: clientUrl,
    line_items: [{ price: priceId, quantity }],
    mode,
    metadata: { ...metadata },
    ...(mode === "subscription" ? { subscription_data: { metadata: { ...metadata } } } : {}),
  });

  return session.url;
}
