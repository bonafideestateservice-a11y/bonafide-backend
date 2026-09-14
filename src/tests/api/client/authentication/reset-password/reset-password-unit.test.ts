// reset-password-unit.test.ts
// Tests the resetPassword handler directly — all deps mocked.

import { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { resetPassword } from "../../../../../api/client/authentication/handlers/reset-password";
import { findValidResetToken, markTokenAsUsed } from "../../../../../api/services/database/password-reset-token";
import { updateClient } from "../../../../../api/client/authentication/services/database/client";
import { HttpStatusCode, BadRequestError } from "../../../../../exceptions";

// --- Mock all dependencies ---
jest.mock("bcryptjs");
jest.mock("../../../../../api/services/database/password-reset-token");
jest.mock("../../../../../api/client/authentication/services/database/client");
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;
const mockedFindValidResetToken = findValidResetToken as jest.Mock;
const mockedMarkTokenAsUsed = markTokenAsUsed as jest.Mock;
const mockedUpdateClient = updateClient as jest.Mock;

function buildMockReqRes(
  params: Record<string, string>,
  body: Record<string, unknown>
) {
  const req = { params, body } as unknown as Request;
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

  it("returns 400 when token param is missing", async () => {
    const { req, res, next } = buildMockReqRes({} as Record<string, string>, {
      password: "newpass123",
    });

    await resetPassword(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
  });

  it("returns 400 when password is missing", async () => {
    const { req, res, next } = buildMockReqRes({ token: "abc123" }, {});

    await resetPassword(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
  });

  it("returns 400 when token is invalid or expired", async () => {
    mockedFindValidResetToken.mockResolvedValue(null);
    const { req, res, next } = buildMockReqRes({ token: "expired_token" }, {
      password: "newpass123",
    });

    await resetPassword(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Token is invalid or has expired." })
    );
  });

  it("returns 200 and resets password on success", async () => {
    const resetRecord = { id: "rt1", userId: "u1" };
    mockedFindValidResetToken.mockResolvedValue(resetRecord);
    mockedBcrypt.hash.mockResolvedValue("new_hashed_pw" as never);
    mockedUpdateClient.mockResolvedValue({ id: "u1" });
    mockedMarkTokenAsUsed.mockResolvedValue({ id: "rt1", used: true });

    const { req, res, next } = buildMockReqRes({ token: "valid_token" }, {
      password: "newpass123",
    });

    await resetPassword(req, res, next);

    expect(mockedBcrypt.hash).toHaveBeenCalledWith("newpass123", 10);
    expect(mockedUpdateClient).toHaveBeenCalledWith({ id: "u1" }, { password: "new_hashed_pw" });
    expect(mockedMarkTokenAsUsed).toHaveBeenCalledWith("rt1");
    expect(res.status).toHaveBeenCalledWith(HttpStatusCode.OK);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Password has been reset successfully." })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next with 500 when an unexpected error is thrown", async () => {
    mockedFindValidResetToken.mockRejectedValue(new Error("DB crash"));
    const { req, res, next } = buildMockReqRes({ token: "tok" }, {
      password: "newpass123",
    });

    await resetPassword(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.INTERNAL_SERVER })
    );
  });
});
