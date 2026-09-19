// forgot-password-unit.test.ts
// Tests the forgotPassword handler directly — all deps mocked.

import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { forgotPassword } from "../../../../../api/client/authentication/handlers/forgot-password";
import { findClient } from "../../../../../api/client/authentication/services/database/client";
import { generateNumericOTP } from "../../../../../utils/otp";
import { createPasswordResetToken as persistPasswordResetToken } from "../../../../../api/services/database/password-reset-token";
import { HttpStatusCode, NotFoundError, ApiError } from "../../../../../exceptions";

// --- Mock all dependencies ---
jest.mock("../../../../../api/client/authentication/services/database/client");
jest.mock("../../../../../utils/otp");
jest.mock("../../../../../api/services/database/password-reset-token");
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));
jest.mock("../../../../../events", () => ({
  appEvents: { emit: jest.fn() },
  AppEventTypes: { FORGOT_PASSWORD: "FORGOT_PASSWORD" },
}));

const mockedFindClient = findClient as jest.Mock;
const mockedGenerateOTP = generateNumericOTP as jest.Mock;
const mockedPersistResetToken = persistPasswordResetToken as jest.Mock;

function buildMockReqRes(body: Record<string, unknown>) {
  const req = { body } as Request;
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  } as unknown as Response;
  const next = jest.fn() as NextFunction;
  return { req, res, next };
}

describe("forgotPassword handler (unit)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 400 when email is missing", async () => {
    const { req, res, next } = buildMockReqRes({});

    await forgotPassword(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatusCode.BAD_REQUEST,
        message: "Email is required.",
      }),
    );
  });

  it("returns 400 when email is empty string", async () => {
    const { req, res, next } = buildMockReqRes({ email: "   " });

    await forgotPassword(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.BAD_REQUEST }),
    );
  });

  it("returns 404 when user is not found", async () => {
    mockedFindClient.mockResolvedValue(null);
    const { req, res, next } = buildMockReqRes({ email: "ghost@example.com" });

    await forgotPassword(req, res, next);

    expect(mockedFindClient).toHaveBeenCalledWith({ email: "ghost@example.com" });
    expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
  });

  it("returns 200 with OTP on success", async () => {
    mockedFindClient.mockResolvedValue({ id: "u1", email: "user@example.com" });
    mockedGenerateOTP.mockReturnValue("123456");
    mockedPersistResetToken.mockResolvedValue({ id: "t1" });

    const { req, res, next } = buildMockReqRes({ email: "user@example.com" });

    await forgotPassword(req, res, next);

    expect(mockedPersistResetToken).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        tokenHash: expect.any(String),
      }),
    );
    expect(res.status).toHaveBeenCalledWith(HttpStatusCode.OK);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "success",
        otp: "123456",
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next with 500 when an unexpected error is thrown", async () => {
    mockedFindClient.mockRejectedValue(new Error("DB fail"));
    const { req, res, next } = buildMockReqRes({ email: "user@example.com" });

    await forgotPassword(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.INTERNAL_SERVER }),
    );
  });
});
