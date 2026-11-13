import Stripe from "stripe";
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
  lineItems?: Stripe.Checkout.SessionCreateParams.LineItem[];
  mode: "payment" | "subscription";
  metadata: PaymentMetadata;
}

export interface SyncStripePriceParams {
  productId: string;
  productName: string;
  productDescription?: string;
  lookupKey: string;
  idempotencyKey: string;
  marker: string;
  productMarker: string;
  amountMinor: number;
  currency: string;
  recurring?: { interval: "week" | "month"; intervalCount: number };
}

export interface SyncedStripePrice {
  productId: string;
  priceId: string;
}

const ensureStripeProduct = async (params: {
  id: string;
  name: string;
  description?: string;
  marker: string;
}) => {
  const stripe = getStripeClient();
  try {
    const product = await stripe.products.create({
      id: params.id,
      name: params.name,
      metadata: { bonafide_product_marker: params.marker },
      ...(params.description ? { description: params.description } : {}),
    });
    if (product.metadata.bonafide_product_marker !== params.marker) {
      throw new Error(`Stripe product ${params.id} does not match local product marker`);
    }
    return product;
  } catch (error) {
    if (
      error instanceof Stripe.errors.StripeInvalidRequestError &&
      error.code === "resource_already_exists"
    ) {
      const product = await stripe.products.retrieve(params.id);
      if ("deleted" in product) {
        throw new Error(`Stripe product ${params.id} has been deleted`);
      }
      if (product.metadata.bonafide_product_marker !== params.marker) {
        throw new Error(`Stripe product ${params.id} does not match local product marker`);
      }
      return product;
    }
    throw error;
  }
};

const validateStripePrice = (
  price: Stripe.Price,
  params: SyncStripePriceParams,
  productId: string,
) => {
  const actualProductId = typeof price.product === "string" ? price.product : price.product.id;
  const recurringMatches = params.recurring
    ? price.recurring?.interval === params.recurring.interval &&
      price.recurring.interval_count === params.recurring.intervalCount
    : price.recurring === null;
  if (
    actualProductId !== productId ||
    price.unit_amount !== params.amountMinor ||
    price.currency.toLowerCase() !== params.currency.toLowerCase() ||
    price.lookup_key !== params.lookupKey ||
    price.metadata.bonafide_price_marker !== params.marker ||
    !price.active ||
    !recurringMatches
  ) {
    throw new Error(`Stripe Price ${price.id} does not match local price version`);
  }
};

export async function syncStripePrice(params: SyncStripePriceParams): Promise<SyncedStripePrice> {
  if (!Number.isSafeInteger(params.amountMinor) || params.amountMinor <= 0) {
    throw new Error("Stripe Price amount must be a positive safe integer");
  }
  if (!params.lookupKey || !params.idempotencyKey || !params.marker || !params.productMarker) {
    throw new Error("Stripe Price lookup and idempotency markers are required");
  }

  const stripe = getStripeClient();
  const product = await ensureStripeProduct({
    id: params.productId,
    name: params.productName,
    description: params.productDescription,
    marker: params.productMarker,
  });
  const existing = await stripe.prices.list({ lookup_keys: [params.lookupKey], limit: 1 });
  if (existing.data[0]) {
    validateStripePrice(existing.data[0], params, product.id);
    return { productId: product.id, priceId: existing.data[0].id };
  }

  const price = await stripe.prices.create(
    {
      product: product.id,
      unit_amount: params.amountMinor,
      currency: params.currency.toLowerCase(),
      lookup_key: params.lookupKey,
      metadata: { bonafide_price_marker: params.marker },
      ...(params.recurring
        ? {
            recurring: {
              interval: params.recurring.interval,
              interval_count: params.recurring.intervalCount,
            },
          }
        : {}),
    },
    { idempotencyKey: params.idempotencyKey },
  );
  validateStripePrice(price, params, product.id);
  return { productId: product.id, priceId: price.id };
}

export async function createStripeSession({
  quantity = 1,
  priceId = process.env.STRIPE_PRICE_ID,
  lineItems,
  mode,
  metadata,
}: CreatePaymentSessionParams) {
  if (!lineItems?.length && !priceId) throw new Error("STRIPE_PRICE_ID is required");
  if (!lineItems?.length && (!Number.isInteger(quantity) || quantity < 1)) {
    throw new Error("quantity must be a positive integer");
  }
  const checkoutLineItems = lineItems ?? (priceId ? [{ price: priceId, quantity }] : []);
  if (!checkoutLineItems.length) {
    throw new Error("At least one Stripe Checkout line item is required");
  }

  const session = await getStripeClient().checkout.sessions.create({
    ...checkoutRedirects(),
    line_items: checkoutLineItems,
    mode,
    metadata: { ...metadata },
    ...(mode === "subscription" ? { subscription_data: { metadata: { ...metadata } } } : {}),
  });

  return { id: session.id, url: session.url };
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

export async function cancelStripeSubscription(
  subscriptionId: string,
): Promise<Stripe.Subscription> {
  return getStripeClient().subscriptions.cancel(subscriptionId);
}
