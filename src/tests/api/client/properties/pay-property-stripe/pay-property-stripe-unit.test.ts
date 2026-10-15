import { payPropertyStripeHandler } from "../../../../../api/client/properties/handlers/pay-property-stripe";
import {
  getPayablePayment,
  startPropertyPaymentCheckout,
  toPaymentResponse,
} from "../../../../../api/services/database/property-request";
import { createStripeCheckout } from "../../../../../libs/stripe/stripe";
import { callHandler, errorStatus } from "../../../../helpers/http";

jest.mock("../../../../../api/services/database/property-request");
jest.mock("../../../../../libs/stripe/stripe", () => ({
  STRIPE_MAX_AMOUNT: 99_999_999,
  createStripeCheckout: jest.fn(),
}));
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedPayable = getPayablePayment as jest.Mock;
const mockedStart = startPropertyPaymentCheckout as jest.Mock;
const mockedCheckout = createStripeCheckout as jest.Mock;
(toPaymentResponse as jest.Mock).mockImplementation((payment) => ({ ...payment }));
const payable = (amountInKobo: bigint, extra = {}) => ({
  kind: "PAYABLE",
  payment: {
    id: "pay1",
    reference: "BF-PAY-111111",
    amountInKobo,
    currency: "NGN",
    status: "READY",
    ...extra,
  },
  email: "c@x.com",
  propertyName: "Villa",
});
const call = () =>
  callHandler(payPropertyStripeHandler, { params: { id: "r1" }, user: { id: "u1" } });

describe("payPropertyStripeHandler (unit)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedCheckout.mockResolvedValue({ id: "cs_1", url: "https://checkout.stripe.com/x" });
    mockedStart.mockResolvedValue({ id: "pay1", status: "PROCESSING" });
  });

  it("starts a Stripe checkout for the full price", async () => {
    mockedPayable.mockResolvedValue(payable(BigInt(50000000)));
    const { res } = await call();
    expect(mockedCheckout).toHaveBeenCalledWith({
      amount: 50000000,
      currency: "NGN",
      name: "Villa (BF-PAY-111111)",
      metadata: { kind: "property_payment", propertyPaymentId: "pay1" },
    });
    expect(mockedStart).toHaveBeenCalledWith("pay1", {
      provider: "STRIPE",
      method: "CARD",
      providerRef: "cs_1",
      checkoutUrl: "https://checkout.stripe.com/x",
    });
    expect(res.json).toHaveBeenCalledWith({ id: "pay1", status: "PROCESSING" });
  });

  it("returns 400 for amounts above Stripe's limit", async () => {
    mockedPayable.mockResolvedValue(payable(BigInt(8500000000)));
    const { next } = await call();
    expect(errorStatus(next)).toBe(400);
    expect(mockedCheckout).not.toHaveBeenCalled();
  });

  it("returns the open Stripe checkout instead of starting another", async () => {
    mockedPayable.mockResolvedValue(
      payable(BigInt(50000000), {
        status: "PROCESSING",
        provider: "STRIPE",
        checkoutUrl: "https://open",
      }),
    );
    const { res } = await call();
    expect(mockedCheckout).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ checkoutUrl: "https://open" }));
  });

  it.each([
    [{ kind: "NOT_FOUND" }, 404],
    [{ kind: "NO_PAYMENT" }, 409],
    [{ kind: "PAID" }, 409],
  ])("maps %j to %s", async (result, status) => {
    mockedPayable.mockResolvedValue(result);
    expect(errorStatus((await call()).next)).toBe(status);
  });

  it("returns 500 when Stripe fails", async () => {
    mockedPayable.mockResolvedValue(payable(BigInt(50000000)));
    mockedCheckout.mockRejectedValue(new Error("stripe down"));
    expect(errorStatus((await call()).next)).toBe(500);
  });
});
