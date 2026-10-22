const verifyPaystackTransaction = jest.fn();
jest.mock("../../../../libs/paystack/paystack", () => ({
  ...jest.requireActual("../../../../libs/paystack/paystack"),
  verifyPaystackTransaction,
}));
jest.mock("../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

import { Request, Response } from "express";
import { callback_url } from "../../../../api/webhooks/paystack";

const SUCCESS = "https://app.example.com/payment/success";
const FAILURE = "https://app.example.com/payment/failed";

const call = async (query: Record<string, string>) => {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn(), redirect: jest.fn() };
  await callback_url({ query } as unknown as Request, res as unknown as Response);
  return res;
};

describe("Paystack callback (unit)", () => {
  const env = { ...process.env };
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.PAYMENT_SUCCESS_URL = SUCCESS;
    process.env.PAYMENT_FAILURE_URL = FAILURE;
  });
  afterAll(() => {
    process.env = env;
  });

  it("sends a paid customer to the success page", async () => {
    verifyPaystackTransaction.mockResolvedValue({ status: "success" });
    const res = await call({ reference: "ref_1" });
    expect(verifyPaystackTransaction).toHaveBeenCalledWith("ref_1");
    expect(res.redirect).toHaveBeenCalledWith(302, `${SUCCESS}?reference=ref_1`);
  });

  it.each(["failed", "abandoned"])("sends a %s charge to the failure page", async (status) => {
    verifyPaystackTransaction.mockResolvedValue({ status });
    const res = await call({ reference: "ref_2" });
    expect(res.redirect).toHaveBeenCalledWith(302, `${FAILURE}?reference=ref_2`);
  });

  it("uses the failure page when Paystack can't confirm the charge", async () => {
    verifyPaystackTransaction.mockRejectedValue(new Error("Transaction reference not found"));
    const res = await call({ reference: "nope" });
    expect(res.redirect).toHaveBeenCalledWith(302, `${FAILURE}?reference=nope`);
  });

  it("uses the failure page without a reference", async () => {
    const res = await call({});
    expect(verifyPaystackTransaction).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(302, FAILURE);
  });

  it("keeps a query the page already has and encodes the reference", async () => {
    process.env.PAYMENT_SUCCESS_URL = `${SUCCESS}?from=paystack`;
    verifyPaystackTransaction.mockResolvedValue({ status: "success" });
    const res = await call({ reference: "a&b" });
    expect(res.redirect).toHaveBeenCalledWith(302, `${SUCCESS}?from=paystack&reference=a%26b`);
  });

  it("returns 500 when the payment pages aren't configured", async () => {
    delete process.env.PAYMENT_FAILURE_URL;
    const res = await call({ reference: "ref_1" });
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.redirect).not.toHaveBeenCalled();
  });
});
