const create = jest.fn();
const mockProductCreate = jest.fn();
const mockProductRetrieve = jest.fn();
const mockPriceList = jest.fn();
const mockPriceCreate = jest.fn();
jest.mock("../../libs/stripe/index", () => ({
  getStripeClient: () => ({
    checkout: { sessions: { create } },
    products: { create: mockProductCreate, retrieve: mockProductRetrieve },
    prices: { list: mockPriceList, create: mockPriceCreate },
  }),
}));

import {
  createStripeCheckout,
  createStripeSession,
  syncStripePrice,
  SyncStripePriceParams,
} from "../../libs/stripe/stripe";

describe("Stripe checkout redirects", () => {
  const env = { ...process.env };
  beforeEach(() => {
    jest.clearAllMocks();
    create.mockResolvedValue({ id: "cs_1", url: "https://checkout.stripe.com/c/cs_1" });
    mockProductCreate.mockResolvedValue({
      id: "prod_basic",
      metadata: { bonafide_product_marker: "bonafide:tier:tier_1" },
    });
    mockProductRetrieve.mockResolvedValue({
      id: "prod_basic",
      metadata: { bonafide_product_marker: "bonafide:tier:tier_1" },
    });
    mockPriceList.mockResolvedValue({ data: [] });
    mockPriceCreate.mockResolvedValue({
      id: "price_basic_v1",
      product: "prod_basic",
      unit_amount: 2500,
      currency: "usd",
      lookup_key: "bonafide_tier_tier_1_v1_usd",
      metadata: { bonafide_price_marker: "bonafide:tier:tier_1:v1:USD" },
      active: true,
      recurring: null,
    });
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

  it("creates an immutable recurring Price with stable markers", async () => {
    const params: SyncStripePriceParams = {
      productId: "prod_basic",
      productName: "Basic - Bonafide tier",
      productMarker: "bonafide:tier:tier_1",
      lookupKey: "bonafide_tier_tier_1_v1_usd",
      idempotencyKey: "bonafide:tier:tier_1:v1:USD:stripe",
      marker: "bonafide:tier:tier_1:v1:USD",
      amountMinor: 6000,
      currency: "USD",
      recurring: { interval: "month", intervalCount: 3 },
    };
    mockPriceCreate.mockResolvedValue({
      id: "price_monitoring_v1",
      product: "prod_basic",
      unit_amount: 6000,
      currency: "usd",
      lookup_key: params.lookupKey,
      metadata: { bonafide_price_marker: params.marker },
      active: true,
      recurring: { interval: "month", interval_count: 3 },
    });

    await expect(syncStripePrice(params)).resolves.toEqual({
      productId: "prod_basic",
      priceId: "price_monitoring_v1",
    });
    expect(mockProductCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "prod_basic",
        metadata: { bonafide_product_marker: params.productMarker },
      }),
    );
    expect(mockPriceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        unit_amount: 6000,
        currency: "usd",
        lookup_key: params.lookupKey,
        recurring: { interval: "month", interval_count: 3 },
      }),
      { idempotencyKey: params.idempotencyKey },
    );
  });

  it("reuses a matching lookup key and rejects mismatched provider terms", async () => {
    const params: SyncStripePriceParams = {
      productId: "prod_basic",
      productName: "Basic - Bonafide tier",
      productMarker: "bonafide:tier:tier_1",
      lookupKey: "bonafide_tier_tier_1_v1_usd",
      idempotencyKey: "bonafide:tier:tier_1:v1:USD:stripe",
      marker: "bonafide:tier:tier_1:v1:USD",
      amountMinor: 2500,
      currency: "USD",
    };
    const matchingPrice = {
      id: "price_existing",
      product: "prod_basic",
      unit_amount: params.amountMinor,
      currency: "usd",
      lookup_key: params.lookupKey,
      metadata: { bonafide_price_marker: params.marker },
      active: true,
      recurring: null,
    };
    mockPriceList.mockResolvedValueOnce({ data: [matchingPrice] });
    await expect(syncStripePrice(params)).resolves.toEqual({
      productId: "prod_basic",
      priceId: "price_existing",
    });
    expect(mockPriceCreate).not.toHaveBeenCalled();

    mockPriceList.mockResolvedValueOnce({
      data: [
        {
          ...matchingPrice,
          unit_amount: 2000,
        },
      ],
    });

    await expect(syncStripePrice(params)).rejects.toThrow("does not match local price version");
    expect(mockPriceCreate).not.toHaveBeenCalled();

    for (const mismatch of [
      { currency: "eur" },
      { recurring: { interval: "year" as const, interval_count: 1 } },
    ]) {
      mockPriceList.mockResolvedValueOnce({
        data: [{ ...matchingPrice, ...mismatch }],
      });
      await expect(syncStripePrice(params)).rejects.toThrow("does not match local price version");
      expect(mockPriceCreate).not.toHaveBeenCalled();
    }
  });
});
