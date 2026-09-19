// reset-password-unit.test.ts
// Tests the resetPassword handler directly — all deps mocked.

import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { resetPassword } from "../../../../../api/admin/authentication/handlers/reset-password";
import {
  findValidResetToken,
  markTokenAsUsed,
} from "../../../../../api/services/database/password-reset-token";
import {
  findAdmin,
  updateAdmin,
} from "../../../../../api/admin/authentication/services/database/admin";
import { hashPassword } from "../../../../../utils/password";
import { HttpStatusCode, BadRequestError } from "../../../../../exceptions";

// --- Mock all dependencies ---
jest.mock("../../../../../api/services/database/password-reset-token");
jest.mock("../../../../../api/admin/authentication/services/database/admin");
jest.mock("../../../../../utils/password");
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedFindAdmin = findAdmin as jest.Mock;
const mockedFindValidResetToken = findValidResetToken as jest.Mock;
const mockedMarkTokenAsUsed = markTokenAsUsed as jest.Mock;
const mockedUpdateAdmin = updateAdmin as jest.Mock;
const mockedHashPassword = hashPassword as jest.Mock;

function buildMockReqRes(body: Record<string, unknown>) {
  const req = { body } as unknown as Request;
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  } as unknown as Response;
  const next = jest.fn() as NextFunction;
  return { req, res, next };
}

describe("resetPassword handler (unit)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 400 when email is missing", async () => {
    const { req, res, next } = buildMockReqRes({
      otp: "123456",
      password: "newpass123",
    });

    await resetPassword(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
  });

  it("returns 400 when otp is missing", async () => {
    const { req, res, next } = buildMockReqRes({
      email: "admin@example.com",
      password: "newpass123",
    });

    await resetPassword(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
  });

  it("returns 400 when password is missing", async () => {
    const { req, res, next } = buildMockReqRes({
      email: "admin@example.com",
      otp: "123456",
    });

    await resetPassword(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
  });

  it("returns 400 when admin not found by email", async () => {
    mockedFindAdmin.mockResolvedValue(null);
    const { req, res, next } = buildMockReqRes({
      email: "ghost@example.com",
      otp: "123456",
      password: "newpass123",
    });

    await resetPassword(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
  });

  it("returns 400 when OTP is invalid or expired", async () => {
    mockedFindAdmin.mockResolvedValue({ id: "u1", email: "admin@example.com" });
    mockedFindValidResetToken.mockResolvedValue(null);
    const { req, res, next } = buildMockReqRes({
      email: "admin@example.com",
      otp: "000000",
      password: "newpass123",
    });

    await resetPassword(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ message: "OTP is invalid or has expired." }),
    );
  });

  it("returns 200 and resets password on success", async () => {
    const resetRecord = { id: "rt1", userId: "u1" };
    mockedFindAdmin.mockResolvedValue({ id: "u1", email: "admin@example.com" });
    mockedFindValidResetToken.mockResolvedValue(resetRecord);
    mockedHashPassword.mockResolvedValue("new_hashed_pw");
    mockedUpdateAdmin.mockResolvedValue({ id: "u1" });
    mockedMarkTokenAsUsed.mockResolvedValue({ id: "rt1", used: true });

    const { req, res, next } = buildMockReqRes({
      email: "admin@example.com",
      otp: "123456",
      password: "newpass123",
    });

    await resetPassword(req, res, next);

    expect(mockedHashPassword).toHaveBeenCalledWith("newpass123");
    expect(mockedUpdateAdmin).toHaveBeenCalledWith({ id: "u1" }, { password: "new_hashed_pw" });
    expect(mockedMarkTokenAsUsed).toHaveBeenCalledWith("rt1");
    expect(res.status).toHaveBeenCalledWith(HttpStatusCode.OK);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Password has been reset successfully." }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next with 500 when an unexpected error is thrown", async () => {
    mockedFindAdmin.mockResolvedValue({ id: "u1", email: "admin@example.com" });
    mockedFindValidResetToken.mockRejectedValue(new Error("DB crash"));
    const { req, res, next } = buildMockReqRes({
      email: "admin@example.com",
      otp: "123456",
      password: "newpass123",
    });

    await resetPassword(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.INTERNAL_SERVER }),
    );
  });
});
