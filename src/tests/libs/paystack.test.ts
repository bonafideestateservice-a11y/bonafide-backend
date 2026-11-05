import axios from "axios";
import {
  createPaystackCheckout,
  createPaystackSession,
  paystackPriceOf,
  syncPaystackPlan,
} from "../../libs/paystack/paystack";

describe("paystackPriceOf", () => {
  it("returns the Nigerian plan price in kobo", () => {
    expect(paystackPriceOf({ priceNgnKobo: 5600000 })).toEqual({
      amount: 5600000,
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
  ])("sends the %s payer back through the backend's callback", async (_, start) => {
    process.env.SERVER_URL = "https://api.example.com/";
    await start();
    expect(sentBody().callback_url).toBe(
      "https://api.example.com/api/v1/webhook/paystack/callback",
    );
  });

  it("leaves the redirect to Paystack's dashboard setting when SERVER_URL isn't set", async () => {
    delete process.env.SERVER_URL;
    await checkout();
    expect(sentBody()).not.toHaveProperty("callback_url");
  });
});

describe("Paystack plan synchronization", () => {
  let request: jest.SpyInstance;

  beforeEach(() => {
    request = jest.spyOn(axios, "request");
  });

  afterEach(() => {
    request.mockRestore();
  });

  const marker = "bonafide:monitoring:monthly:v2:NGN";

  it("creates a recurring plan using the stable marker", async () => {
    request.mockResolvedValueOnce({ data: { status: true, data: [] } }).mockResolvedValueOnce({
      data: {
        status: true,
        data: {
          plan_code: "PLN_monthly_v2",
          description: marker,
          amount: 600000,
          currency: "NGN",
          interval: "monthly",
        },
      },
    });

    await expect(
      syncPaystackPlan({
        name: "Monthly Monitoring",
        amount: 600000,
        interval: "monthly",
        description: marker,
      }),
    ).resolves.toEqual({ planCode: "PLN_monthly_v2" });
    expect(request.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        method: "POST",
        url: "https://api.paystack.co/plan",
        data: expect.objectContaining({
          amount: 600000,
          currency: "NGN",
          interval: "monthly",
          description: marker,
        }),
      }),
    );
  });

  it("reuses a matching plan and rejects a marker whose terms differ", async () => {
    request.mockResolvedValueOnce({
      data: {
        status: true,
        data: [
          {
            plan_code: "PLN_monthly_v2",
            description: marker,
            amount: "600000",
            currency: "NGN",
            interval: "monthly",
          },
        ],
      },
    });
    await expect(
      syncPaystackPlan({
        name: "Monthly Monitoring",
        amount: 600000,
        interval: "monthly",
        description: marker,
      }),
    ).resolves.toEqual({ planCode: "PLN_monthly_v2" });
    expect(request).toHaveBeenCalledTimes(1);

    request.mockReset().mockResolvedValueOnce({
      data: {
        status: true,
        data: [
          {
            plan_code: "PLN_monthly_v2",
            description: marker,
            amount: 500000,
            currency: "NGN",
            interval: "monthly",
          },
        ],
      },
    });
    await expect(
      syncPaystackPlan({
        name: "Monthly Monitoring",
        amount: 600000,
        interval: "monthly",
        description: marker,
      }),
    ).rejects.toThrow("does not match local price version");
    expect(request).toHaveBeenCalledTimes(1);

    for (const mismatch of [{ currency: "USD" }, { interval: "annually" }]) {
      request.mockReset().mockResolvedValueOnce({
        data: {
          status: true,
          data: [
            {
              plan_code: "PLN_monthly_v2",
              description: marker,
              amount: 600000,
              currency: "NGN",
              interval: "monthly",
              ...mismatch,
            },
          ],
        },
      });
      await expect(
        syncPaystackPlan({
          name: "Monthly Monitoring",
          amount: 600000,
          interval: "monthly",
          description: marker,
        }),
      ).rejects.toThrow("does not match local price version");
      expect(request).toHaveBeenCalledTimes(1);
    }
  });
});
