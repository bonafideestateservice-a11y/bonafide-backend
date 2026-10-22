const create = jest.fn();
jest.mock("../../libs/stripe/index", () => ({
  getStripeClient: () => ({ checkout: { sessions: { create } } }),
}));

import { createStripeCheckout, createStripeSession } from "../../libs/stripe/stripe";

describe("Stripe checkout redirects", () => {
  const env = { ...process.env };
  beforeEach(() => {
    jest.clearAllMocks();
    create.mockResolvedValue({ id: "cs_1", url: "https://checkout.stripe.com/c/cs_1" });
    process.env.PAYMENT_SUCCESS_URL = "https://app.example.com/payment/success";
    process.env.PAYMENT_FAILURE_URL = "https://app.example.com/payment/failed";
  });
  afterAll(() => {
    process.env = env;
  });

  const checkout = () =>
    createStripeCheckout({ amount: 100, currency: "NGN", name: "Palm Villa", metadata: {} });
  const session = () =>
    createStripeSession({ priceId: "price_1", mode: "payment", metadata: {} as never });

  it.each([
    ["property checkout", checkout],
    ["verification session", session],
  ])(
    "sends the %s to the success page with the session id, or back to the failure page",
    async (_, start) => {
      await start();
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          success_url: "https://app.example.com/payment/success?session_id={CHECKOUT_SESSION_ID}",
          cancel_url: "https://app.example.com/payment/failed",
        }),
      );
    },
  );

  it("needs a success page, which Stripe requires", async () => {
    delete process.env.PAYMENT_SUCCESS_URL;
    await expect(checkout()).rejects.toThrow("PAYMENT_SUCCESS_URL is required");
    expect(create).not.toHaveBeenCalled();
  });

  it("works without a failure page (no back link on Stripe's page)", async () => {
    delete process.env.PAYMENT_FAILURE_URL;
    await checkout();
    expect(create.mock.calls[0][0]).not.toHaveProperty("cancel_url");
  });
});
