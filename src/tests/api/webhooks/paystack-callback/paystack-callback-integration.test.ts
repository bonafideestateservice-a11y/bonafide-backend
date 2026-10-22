const verifyPaystackTransaction = jest.fn();
jest.mock("../../../../libs/paystack/paystack", () => ({
  ...jest.requireActual("../../../../libs/paystack/paystack"),
  verifyPaystackTransaction,
}));

import request from "supertest";
import app from "../../../../app";

const SUCCESS = "https://app.example.com/payment/success";
const FAILURE = "https://app.example.com/payment/failed";

const callback = (query = "") => request(app).get(`/api/v1/webhook/paystack/callback${query}`);

describe("GET /api/v1/webhook/paystack/callback", () => {
  const env = { ...process.env };
  beforeAll(() => {
    process.env.PAYMENT_SUCCESS_URL = SUCCESS;
    process.env.PAYMENT_FAILURE_URL = FAILURE;
  });
  afterAll(() => {
    process.env = env;
  });

  it("redirects a paid customer to the success page", async () => {
    verifyPaystackTransaction.mockResolvedValue({ status: "success" });
    const response = await callback("?reference=ref_ok");
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(`${SUCCESS}?reference=ref_ok`);
  });

  it("redirects a failed or unknown payment to the failure page", async () => {
    verifyPaystackTransaction.mockResolvedValue({ status: "failed" });
    expect((await callback("?reference=ref_bad")).headers.location).toBe(
      `${FAILURE}?reference=ref_bad`,
    );
    expect((await callback()).headers.location).toBe(FAILURE);
  });
});
