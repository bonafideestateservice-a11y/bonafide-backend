import crypto from "crypto";
import { verifyOtp } from "../../../../../api/client/authentication/handlers/verify-otp";
import { findValidResetToken } from "../../../../../api/services/database/password-reset-token";
import { callHandler, errorStatus } from "../../../../helpers/http";

jest.mock("../../../../../api/services/database/password-reset-token");
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedFind = findValidResetToken as jest.Mock;
const hashOf = (otp: string) => crypto.createHash("sha256").update(otp).digest("hex");
const call = (body: unknown) => callHandler(verifyOtp, { body });

describe("verifyOtp (client, unit)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("accepts a valid OTP, looked up by the hash of the trimmed code", async () => {
    mockedFind.mockResolvedValue({ id: "t1" });

    const { res, next } = await call({ otp: " 123456 " });

    expect(mockedFind).toHaveBeenCalledWith(hashOf("123456"));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      status: "success",
      message: "OTP verified successfully.",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it.each([[{}], [{ otp: "" }]])("returns 400 when the OTP is missing (%j)", async (body) => {
    const { next } = await call(body);
    expect(errorStatus(next)).toBe(400);
    expect(next.mock.calls[0][0].message).toBe("OTP is required.");
    expect(mockedFind).not.toHaveBeenCalled();
  });

  it("returns 400 for an unknown, expired or used OTP", async () => {
    mockedFind.mockResolvedValue(null);
    const { next } = await call({ otp: "000000" });
    expect(errorStatus(next)).toBe(400);
    expect(next.mock.calls[0][0].message).toBe("OTP is invalid or has expired.");
  });

  it("returns 500 when the lookup fails", async () => {
    mockedFind.mockRejectedValue(new Error("db down"));
    expect(errorStatus((await call({ otp: "123456" })).next)).toBe(500);
  });

  // Known issue #13: a non-string OTP should be a 400. Update this test when it's fixed.
  it("currently returns 500 for a non-string OTP", async () => {
    expect(errorStatus((await call({ otp: 123456 })).next)).toBe(500);
  });
});
