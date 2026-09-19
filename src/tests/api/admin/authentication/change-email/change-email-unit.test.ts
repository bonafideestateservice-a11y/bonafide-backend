import { NextFunction, Request, Response } from "express";
import { changeEmail } from "../../../../../api/admin/authentication/handlers/change-email";
import {
  findAdmin,
  updateAdminEmail,
} from "../../../../../api/admin/authentication/services/database/admin";
import { HttpStatusCode } from "../../../../../exceptions";

jest.mock("../../../../../api/admin/authentication/services/database/admin");
jest.mock("../../../../../utils/password", () => ({
  verifyPassword: jest.fn().mockResolvedValue(true),
}));
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedFindAdmin = findAdmin as jest.Mock;
const mockedUpdateEmail = updateAdminEmail as jest.Mock;

function buildMockReqRes(body: Record<string, unknown>) {
  const req = { user: { id: "user-1" }, body } as unknown as Request;
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response;
  const next = jest.fn() as NextFunction;
  return { req, res, next };
}

describe("changeEmail handler (unit)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedFindAdmin.mockResolvedValue({ id: "user-1", password: "hashed-password" });
  });

  it("changes email after password confirmation", async () => {
    const profile = { id: "user-1", email: "new@example.com" };
    mockedUpdateEmail.mockResolvedValue(profile);
    const { req, res, next } = buildMockReqRes({
      newEmail: " New@Example.com ",
      password: "CorrectPass123",
    });

    await changeEmail(req, res, next);

    expect(mockedUpdateEmail).toHaveBeenCalledWith("user-1", "new@example.com");
    expect(res.status).toHaveBeenCalledWith(HttpStatusCode.OK);
    expect(res.json).toHaveBeenCalledWith(profile);
  });

  it("rejects missing password confirmation", async () => {
    const { req, res, next } = buildMockReqRes({ newEmail: "new@example.com" });
    await changeEmail(req, res, next);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.BAD_REQUEST }),
    );
    expect(mockedUpdateEmail).not.toHaveBeenCalled();
  });
});
