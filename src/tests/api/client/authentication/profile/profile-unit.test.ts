import { NextFunction, Request, Response } from "express";
import { getProfile } from "../../../../../api/client/authentication/handlers/get-profile";
import { updateProfile } from "../../../../../api/client/authentication/handlers/update-profile";
import { changeEmail } from "../../../../../api/client/authentication/handlers/change-email";
import {
  findClient,
  getClientProfile,
  updateClientEmail,
  updateClientProfile,
} from "../../../../../api/client/authentication/services/database/client";
import { HttpStatusCode } from "../../../../../exceptions";

jest.mock("cloudinary", () => ({
  v2: {
    config: jest.fn(),
    uploader: { upload: jest.fn().mockResolvedValue({ secure_url: "https://cdn.test/profile.jpg" }) },
  },
}));
jest.mock("../../../../../api/client/authentication/services/database/client");
jest.mock("../../../../../utils/password", () => ({ verifyPassword: jest.fn().mockResolvedValue(true) }));
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedGetProfile = getClientProfile as jest.Mock;
const mockedUpdateProfile = updateClientProfile as jest.Mock;
const mockedFindClient = findClient as jest.Mock;
const mockedUpdateEmail = updateClientEmail as jest.Mock;

function buildMockReqRes(body: Record<string, unknown> = {}) {
  const req = { user: { id: "client-1" }, body } as unknown as Request;
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response;
  const next = jest.fn() as NextFunction;
  return { req, res, next };
}

describe("client profile handlers (unit)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetProfile.mockResolvedValue({ id: "client-1" });
    mockedFindClient.mockResolvedValue({ id: "client-1", password: "hashed" });
  });

  it("gets the client profile", async () => {
    const profile = { id: "client-1", fullName: "Client User" };
    mockedGetProfile.mockResolvedValue(profile);
    const { req, res, next } = buildMockReqRes();
    await getProfile(req, res, next);
    expect(res.status).toHaveBeenCalledWith(HttpStatusCode.OK);
    expect(res.json).toHaveBeenCalledWith(profile);
  });

  it("updates client profile fields", async () => {
    const profile = { id: "client-1", fullName: "Updated Client" };
    mockedUpdateProfile.mockResolvedValue(profile);
    const { req, res, next } = buildMockReqRes({ fullName: " Updated Client ", location: "Lagos" });
    await updateProfile(req, res, next);
    expect(mockedUpdateProfile).toHaveBeenCalledWith("client-1", {
      fullName: "Updated Client",
      location: "Lagos",
    });
    expect(res.status).toHaveBeenCalledWith(HttpStatusCode.OK);
  });

  it("changes the client email after password confirmation", async () => {
    const profile = { id: "client-1", email: "new@example.com" };
    mockedUpdateEmail.mockResolvedValue(profile);
    const { req, res, next } = buildMockReqRes({
      newEmail: "NEW@example.com",
      password: "CorrectPass123",
    });
    await changeEmail(req, res, next);
    expect(mockedUpdateEmail).toHaveBeenCalledWith("client-1", "new@example.com");
    expect(res.status).toHaveBeenCalledWith(HttpStatusCode.OK);
  });

  it("rejects a profile update with no changes", async () => {
    const { req, res, next } = buildMockReqRes();
    await updateProfile(req, res, next);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.BAD_REQUEST }),
    );
  });
});
