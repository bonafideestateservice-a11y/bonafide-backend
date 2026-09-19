// change-password-unit.test.ts
// Tests the changePassword handler directly — no HTTP layer, all deps mocked.

import { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import { changePassword } from "../../../../../api/client/authentication/handlers/change-password";
import {
  findClient,
  updateClient,
} from "../../../../../api/client/authentication/services/database/client";
import { HttpStatusCode, NotFoundError, UnauthorizedError } from "../../../../../exceptions";
import { CustomRequest } from "../../../../../middlewares/check-jwt";

// --- Mock every external dependency ---
jest.mock("bcryptjs");
jest.mock("../../../../../api/client/authentication/services/database/client");
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;
const mockedFindClient = findClient as jest.Mock;
const mockedUpdateClient = updateClient as jest.Mock;

function buildMockReqRes(body: Record<string, unknown>, tokenPayload?: { id: string }) {
  const req = { body, token: tokenPayload } as unknown as CustomRequest;
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  } as unknown as Response;
  const next = jest.fn() as NextFunction;
  return { req: req as Request, res, next };
}

describe("changePassword handler (unit)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 401 when no token payload is present", async () => {
    const { req, res, next } = buildMockReqRes({
      currentPassword: "old",
      newPassword: "newpass123",
      confirmPassword: "newpass123",
    });

    await changePassword(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.UNAUTHORIZED }),
    );
  });

  it("returns 400 when password fields are missing", async () => {
    const { req, res, next } = buildMockReqRes({ currentPassword: "old" }, { id: "u1" });

    await changePassword(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.BAD_REQUEST }),
    );
  });

  it("returns 400 when new password is too short", async () => {
    const { req, res, next } = buildMockReqRes(
      { currentPassword: "old", newPassword: "short", confirmPassword: "short" },
      { id: "u1" },
    );

    await changePassword(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatusCode.BAD_REQUEST,
        message: "New password must be at least 8 characters.",
      }),
    );
  });

  it("returns 400 when newPassword and confirmPassword do not match", async () => {
    const { req, res, next } = buildMockReqRes(
      { currentPassword: "old", newPassword: "newpass123", confirmPassword: "different1" },
      { id: "u1" },
    );

    await changePassword(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatusCode.BAD_REQUEST,
        message: "New password and confirmation do not match.",
      }),
    );
  });

  it("returns 404 when user is not found", async () => {
    mockedFindClient.mockResolvedValue(null);
    const { req, res, next } = buildMockReqRes(
      { currentPassword: "old", newPassword: "newpass123", confirmPassword: "newpass123" },
      { id: "u1" },
    );

    await changePassword(req, res, next);

    expect(mockedFindClient).toHaveBeenCalledWith({ id: "u1" });
    expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
  });

  it("returns 401 when current password is incorrect", async () => {
    mockedFindClient.mockResolvedValue({ id: "u1", password: "hashed" });
    mockedBcrypt.compare.mockResolvedValue(false as never);

    const { req, res, next } = buildMockReqRes(
      { currentPassword: "wrongpass", newPassword: "newpass123", confirmPassword: "newpass123" },
      { id: "u1" },
    );

    await changePassword(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });

  it("returns 200 on successful password change", async () => {
    mockedFindClient.mockResolvedValue({ id: "u1", password: "hashed" });
    mockedBcrypt.compare.mockResolvedValue(true as never);
    mockedBcrypt.hash.mockResolvedValue("new_hashed" as never);
    mockedUpdateClient.mockResolvedValue({ id: "u1" });

    const { req, res, next } = buildMockReqRes(
      { currentPassword: "correct", newPassword: "newpass123", confirmPassword: "newpass123" },
      { id: "u1" },
    );

    await changePassword(req, res, next);

    expect(mockedBcrypt.hash).toHaveBeenCalledWith("newpass123", 10);
    expect(mockedUpdateClient).toHaveBeenCalledWith({ id: "u1" }, { password: "new_hashed" });
    expect(res.status).toHaveBeenCalledWith(HttpStatusCode.OK);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Password has been changed successfully." }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next with 500 when an unexpected error is thrown", async () => {
    mockedFindClient.mockRejectedValue(new Error("DB exploded"));
    const { req, res, next } = buildMockReqRes(
      { currentPassword: "old", newPassword: "newpass123", confirmPassword: "newpass123" },
      { id: "u1" },
    );

    await changePassword(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.INTERNAL_SERVER }),
    );
  });
});
