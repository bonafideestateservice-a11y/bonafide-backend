import { stripe } from "./index";

export interface CreatePaymentSessionParams {
  quantity?: number;
}

export async function createStripeSession({ quantity = 1 }: CreatePaymentSessionParams = {}) {
  const clientUrl = process.env.CLIENT_URL;
  const priceId = process.env.STRIPE_PRICE_ID;

  if (!clientUrl) throw new Error("CLIENT_URL is required");
  if (!priceId) throw new Error("STRIPE_PRICE_ID is required");
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new Error("quantity must be a positive integer");
  }

  const session = await stripe.checkout.sessions.create({
    success_url: clientUrl,
    cancel_url: clientUrl,
    line_items: [{ price: priceId, quantity }],
    mode: "subscription",
  });

  return session.url;
}
