import { payPropertyPaystackHandler } from "../../../../../api/client/properties/handlers/pay-property-paystack";
import {
  getPayablePayment,
  startPropertyPaymentCheckout,
  toPaymentResponse,
} from "../../../../../api/services/database/property-request";
import { createPaystackCheckout } from "../../../../../libs/paystack/paystack";
import { callHandler, errorStatus } from "../../../../helpers/http";

jest.mock("../../../../../api/services/database/property-request");
jest.mock("../../../../../libs/paystack/paystack");
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedPayable = getPayablePayment as jest.Mock;
const mockedStart = startPropertyPaymentCheckout as jest.Mock;
const mockedCheckout = createPaystackCheckout as jest.Mock;
(toPaymentResponse as jest.Mock).mockImplementation((payment) => ({ ...payment }));
const payment = { id: "pay1", amountInKobo: BigInt(8500000000), currency: "NGN", status: "READY" };
const call = (body: unknown) =>
  callHandler(payPropertyPaystackHandler, { params: { id: "r1" }, user: { id: "u1" }, body });

describe("payPropertyPaystackHandler (unit)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedPayable.mockResolvedValue({
      kind: "PAYABLE",
      payment,
      email: "c@x.com",
      propertyName: "Villa",
    });
    mockedCheckout.mockResolvedValue({
      reference: "ps_ref",
      authorization_url: "https://checkout/x",
    });
    mockedStart.mockResolvedValue({ id: "pay1", status: "PROCESSING" });
  });

  it.each([
    ["CARD", "card"],
    ["BANK_TRANSFER", "bank_transfer"],
  ])("starts a %s checkout for the full price", async (method, channel) => {
    const { res } = await call({ method });

    expect(mockedPayable).toHaveBeenCalledWith("r1", "u1");
    expect(mockedCheckout).toHaveBeenCalledWith({
      email: "c@x.com",
      amount: 8500000000,
      currency: "NGN",
      channels: [channel],
      metadata: { kind: "property_payment", propertyPaymentId: "pay1" },
    });
    expect(mockedStart).toHaveBeenCalledWith("pay1", {
      provider: "PAYSTACK",
      method,
      providerRef: "ps_ref",
      checkoutUrl: "https://checkout/x",
    });
    expect(res.json).toHaveBeenCalledWith({ id: "pay1", status: "PROCESSING" });
  });

  it("returns the open checkout instead of starting another for the same method", async () => {
    const open = {
      ...payment,
      status: "PROCESSING",
      provider: "PAYSTACK",
      method: "CARD",
      checkoutUrl: "https://open",
    };
    mockedPayable.mockResolvedValue({
      kind: "PAYABLE",
      payment: open,
      email: "c@x.com",
      propertyName: "Villa",
    });

    const { res } = await call({ method: "CARD" });

    expect(mockedCheckout).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ checkoutUrl: "https://open" }));
  });

  it("starts a new checkout when the client changes method", async () => {
    const open = {
      ...payment,
      status: "PROCESSING",
      provider: "PAYSTACK",
      method: "CARD",
      checkoutUrl: "https://open",
    };
    mockedPayable.mockResolvedValue({
      kind: "PAYABLE",
      payment: open,
      email: "c@x.com",
      propertyName: "Villa",
    });
    await call({ method: "BANK_TRANSFER" });
    expect(mockedCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ channels: ["bank_transfer"] }),
    );
  });

  it.each([
    [{ kind: "NOT_FOUND" }, 404],
    [{ kind: "NO_PAYMENT" }, 409],
    [{ kind: "PAID" }, 409],
    [{ kind: "CLOSED", status: "CANCELLED" }, 409],
  ])("maps %j to %s", async (result, status) => {
    mockedPayable.mockResolvedValue(result);
    expect(errorStatus((await call({ method: "CARD" })).next)).toBe(status);
    expect(mockedCheckout).not.toHaveBeenCalled();
  });

  it("returns 400 for a missing or unknown method", async () => {
    expect(errorStatus((await call({})).next)).toBe(400);
    expect(errorStatus((await call({ method: "CASH" })).next)).toBe(400);
  });

  it("returns 500 when Paystack fails", async () => {
    mockedCheckout.mockRejectedValue(
      new Error("Paystack POST /transaction/initialize failed (401)"),
    );
    expect(errorStatus((await call({ method: "CARD" })).next)).toBe(500);
  });
});
