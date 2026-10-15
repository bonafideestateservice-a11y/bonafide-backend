import { paystackPriceOf } from "../../libs/paystack/paystack";

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
