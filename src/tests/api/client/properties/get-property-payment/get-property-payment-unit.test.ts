import { getPropertyPaymentHandler } from "../../../../../api/client/properties/handlers/get-property-payment";
import {
  findPropertyRequest,
  toPaymentResponse,
} from "../../../../../api/services/database/property-request";
import { callHandler, errorStatus } from "../../../../helpers/http";

jest.mock("../../../../../api/services/database/property-request");
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedFind = findPropertyRequest as jest.Mock;
(toPaymentResponse as jest.Mock).mockImplementation((payment) => ({ id: payment.id }));
const call = () =>
  callHandler(getPropertyPaymentHandler, { params: { id: "r1" }, user: { id: "u1" } });

describe("getPropertyPaymentHandler (unit)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns the payment", async () => {
    mockedFind.mockResolvedValue({ id: "r1", payment: { id: "pay1" } });
    const { res } = await call();
    expect(res.json).toHaveBeenCalledWith({ id: "pay1" });
  });

  it("returns 404 when there's no request or no payment yet", async () => {
    mockedFind.mockResolvedValueOnce(null);
    expect(errorStatus((await call()).next)).toBe(404);
    mockedFind.mockResolvedValueOnce({ id: "r1", payment: null });
    expect(errorStatus((await call()).next)).toBe(404);
  });

  it("returns 500 when the query fails", async () => {
    mockedFind.mockRejectedValue(new Error("db down"));
    expect(errorStatus((await call()).next)).toBe(500);
  });
});
