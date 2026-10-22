/**
 * The frontend pages a customer lands on after a Stripe or Paystack checkout. They only show
 * the outcome: the payment itself is recorded by the provider's webhook.
 */
export const paymentPages = () => ({
  success: process.env.PAYMENT_SUCCESS_URL,
  failure: process.env.PAYMENT_FAILURE_URL,
});

/** Adds `name=value` to a URL, keeping any query it already has. */
export const withQuery = (url: string, name: string, value: string) =>
  `${url}${url.includes("?") ? "&" : "?"}${name}=${value}`;
