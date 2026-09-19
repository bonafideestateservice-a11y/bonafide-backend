import { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import { signUp } from "../../../../../api/client/authentication/handlers/signup";
import {
  createClient,
  findClient,
} from "../../../../../api/client/authentication/services/database/client";
import { generateToken } from "../../../../../utils/jwt";
import { HttpStatusCode, ConflictError } from "../../../../../exceptions";
import { ROLE } from "@prisma/client";

// --- Mock external dependencies ---
jest.mock("bcryptjs");
jest.mock("../../../../../api/client/authentication/services/database/client");
jest.mock("../../../../../utils/jwt");
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;
const mockedFindClient = findClient as jest.Mock;
const mockedCreateClient = createClient as jest.Mock;
const mockedGenerateToken = generateToken as jest.Mock;

function buildMockReqRes(body: Record<string, unknown>) {
  const req = { body } as Request;
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  } as unknown as Response;
  const next = jest.fn() as NextFunction;
  return { req, res, next };
}

describe("signUp handler (unit)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 400 when fullName is missing", async () => {
    const { req, res, next } = buildMockReqRes({ email: "test@test.com", password: "password123" });
    await signUp(req, res, next);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.BAD_REQUEST }),
    );
  });

  it("returns 400 when password is too short", async () => {
    const { req, res, next } = buildMockReqRes({
      fullName: "Test User",
      email: "test@test.com",
      password: "short",
    });
    await signUp(req, res, next);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.BAD_REQUEST }),
    );
  });

  it("returns 409 when email already exists", async () => {
    mockedFindClient.mockResolvedValue({ id: "user_1" });
    const { req, res, next } = buildMockReqRes({
      fullName: "Test User",
      email: "test@test.com",
      password: "password123",
    });

    await signUp(req, res, next);

    expect(mockedFindClient).toHaveBeenCalledWith({ email: "test@test.com" });
    expect(next).toHaveBeenCalledWith(expect.any(ConflictError));
  });

  it("returns 201 with token and user on success", async () => {
    mockedFindClient.mockResolvedValue(null);
    mockedBcrypt.hash.mockResolvedValue("hashed_password" as never);
    mockedCreateClient.mockResolvedValue({
      id: "u1",
      email: "test@test.com",
      password: "hashed_password",
      fullName: "Test User",
      role: ROLE.CLIENT,
    });
    mockedGenerateToken.mockReturnValue("jwt.token.here");

    const { req, res, next } = buildMockReqRes({
      fullName: "Test User",
      email: "test@test.com",
      password: "password123",
      termsAndCondition: true,
    });

    await signUp(req, res, next);

    expect(res.status).toHaveBeenCalledWith(HttpStatusCode.CREATED);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Sign up successful.",
        token: "jwt.token.here",
        user: expect.not.objectContaining({ password: expect.anything() }),
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });
});
