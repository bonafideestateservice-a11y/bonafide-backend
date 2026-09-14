// login.unit.test.ts
// Run with your normal Jest command (e.g. `jest login.unit.test.ts`)
//
// This tests the HANDLER FUNCTION directly — no HTTP layer, no Express
// app, no real bcrypt hashing. Every dependency is mocked, so this is
// fast and isolated, but it does NOT prove routing/middleware work.

import { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import { login } from "../../../../../api/client/authentication/handlers/login/login-v1"; // adjust path to your handler
import { findClient } from "../../../../../api/client/authentication/services/database/client";
import { generateToken } from "../../../../../utils/jwt";
import {  NotFoundError, HttpStatusCode } from "../../../../../exceptions";

// --- Mock every external dependency the handler touches ---
jest.mock("bcryptjs");
jest.mock("../../../../../api/client/authentication/services/database/client");
jest.mock("../../../../../utils/jwt");
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn() },
}));

const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;
const mockedFindClient = findClient as jest.Mock;
const mockedGenerateToken = generateToken as jest.Mock;

// Helper to build a fake Express req/res/next each test
function buildMockReqRes(body: Record<string, unknown>) {
  const req = { body } as Request;
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  } as unknown as Response;
  const next = jest.fn() as NextFunction;
  return { req, res, next };
}

describe("login handler (unit)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 400 via next() when email is missing", async () => {
    const { req, res, next } = buildMockReqRes({ password: "secret123" });

    await login(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatusCode.BAD_REQUEST,
        message: "Email is required.",
      })
    );
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns 400 via next() when password is missing", async () => {
    const { req, res, next } = buildMockReqRes({ email: "user@example.com" });

    await login(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.BAD_REQUEST })
    );
  });

  it("calls next(NotFoundError) when user does not exist", async () => {
    mockedFindClient.mockResolvedValue(null);
    const { req, res, next } = buildMockReqRes({
      email: "ghost@example.com",
      password: "secret123",
    });

    await login(req, res, next);

    expect(mockedFindClient).toHaveBeenCalledWith({ email: "ghost@example.com" });
    expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
  });

  it("calls next(ApiError 401) when password is invalid", async () => {
    mockedFindClient.mockResolvedValue({
      id: "u1",
      email: "user@example.com",
      password: "hashed",
    });
    mockedBcrypt.compare.mockResolvedValue(false as never);

    const { req, res, next } = buildMockReqRes({
      email: "user@example.com",
      password: "wrongpass",
    });

    await login(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.UNAUTHORIZED })
    );
  });

  it("returns 200 with token and user (password stripped) on success", async () => {
    mockedFindClient.mockResolvedValue({
      id: "u1",
      email: "user@example.com",
      password: "hashed",
      name: "Jane",
    });
    mockedBcrypt.compare.mockResolvedValue(true as never);
    mockedGenerateToken.mockReturnValue("fake.jwt.token");

    const { req, res, next } = buildMockReqRes({
      email: "user@example.com",
      password: "correctpass",
    });

    await login(req, res, next);

    expect(res.status).toHaveBeenCalledWith(HttpStatusCode.OK);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Login successful.",
        token: "fake.jwt.token",
        user: expect.not.objectContaining({ password: expect.anything() }),
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next(ApiError 500) when an unexpected error is thrown", async () => {
    mockedFindClient.mockRejectedValue(new Error("DB connection lost"));
    const { req, res, next } = buildMockReqRes({
      email: "user@example.com",
      password: "secret123",
    });

    await login(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.INTERNAL_SERVER })
    );
  });
});