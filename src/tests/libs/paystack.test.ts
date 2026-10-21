import axios from "axios";
import {
  createPaystackCheckout,
  createPaystackSession,
  paystackPriceOf,
} from "../../libs/paystack/paystack";

describe("paystackPriceOf", () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  const usdPlan = { priceInCents: 3500, currency: "USD" };

  it("charges USD plans in naira with a test key and a rate", () => {
    process.env.PAYSTACK_SECRET_KEY = "sk_test_abc";
    process.env.PAYSTACK_TEST_USD_TO_NGN_RATE = "1600";
    // $35.00 × 1600 = ₦56,000 = 5,600,000 kobo.
    expect(paystackPriceOf(usdPlan)).toEqual({ amount: 5600000, currency: "NGN" });
  });

  it("never converts with a live key, even if the rate is set", () => {
    process.env.PAYSTACK_SECRET_KEY = "sk_live_abc";
    process.env.PAYSTACK_TEST_USD_TO_NGN_RATE = "1600";
    expect(paystackPriceOf(usdPlan)).toEqual({ amount: 3500, currency: "USD" });
  });

  it.each([undefined, "", "0", "abc"])("doesn't convert when the rate is %p", (rate) => {
    process.env.PAYSTACK_SECRET_KEY = "sk_test_abc";
    if (rate === undefined) delete process.env.PAYSTACK_TEST_USD_TO_NGN_RATE;
    else process.env.PAYSTACK_TEST_USD_TO_NGN_RATE = rate;
    expect(paystackPriceOf(usdPlan)).toEqual({ amount: 3500, currency: "USD" });
  });

  it("leaves plans already in naira alone", () => {
    process.env.PAYSTACK_SECRET_KEY = "sk_test_abc";
    process.env.PAYSTACK_TEST_USD_TO_NGN_RATE = "1600";
    expect(paystackPriceOf({ priceInCents: 5000000, currency: "NGN" })).toEqual({
      amount: 5000000,
      currency: "NGN",
    });
  });
});

describe("Paystack redirect after paying", () => {
  const env = { ...process.env };
  let request: jest.SpyInstance;

  beforeEach(() => {
    request = jest
      .spyOn(axios, "request")
      .mockResolvedValue({ data: { status: true, data: { reference: "ref" } } });
  });
  afterEach(() => {
    request.mockRestore();
    process.env = { ...env };
  });

  const sentBody = () => request.mock.calls[0][0].data;
  const session = () =>
    createPaystackSession({
      email: "ada@example.com",
      amount: 5600000,
      customer: "CUS_1",
      currency: "NGN",
      userId: "u1",
      verificationRequestId: "vr1",
      transactionId: "t1",
    } as Parameters<typeof createPaystackSession>[0]);
  const checkout = () =>
    createPaystackCheckout({
      email: "ada@example.com",
      amount: 100,
      currency: "NGN",
      channels: ["card"],
      metadata: {},
    });

  it.each([
    ["verification", session],
    ["property", checkout],
  ])("sends the %s payer back to CLIENT_URL", async (_, start) => {
    process.env.CLIENT_URL = "https://app.example.com";
    await start();
    expect(sentBody().callback_url).toBe("https://app.example.com");
  });

  it("leaves the redirect to Paystack's dashboard setting when CLIENT_URL isn't set", async () => {
    delete process.env.CLIENT_URL;
    await checkout();
    expect(sentBody()).not.toHaveProperty("callback_url");
  });
});
