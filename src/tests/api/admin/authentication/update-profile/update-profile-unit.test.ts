import { NextFunction, Request, Response } from "express";
import { updateProfile } from "../../../../../api/admin/authentication/handlers/update-profile";
import {
  getAdminProfile,
  updateAdminProfile,
} from "../../../../../api/admin/authentication/services/database/admin";
import { HttpStatusCode } from "../../../../../exceptions";

jest.mock("cloudinary", () => ({
  v2: {
    config: jest.fn(),
    uploader: {
      upload: jest.fn().mockResolvedValue({ secure_url: "https://cdn.test/profile.jpg" }),
    },
  },
}));
jest.mock("../../../../../api/admin/authentication/services/database/admin");
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedGetProfile = getAdminProfile as jest.Mock;
const mockedUpdateProfile = updateAdminProfile as jest.Mock;

function buildMockReqRes(body: Record<string, unknown> = {}) {
  const req = {
    user: { id: "user-1" },
    body,
  } as unknown as Request;
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response;
  const next = jest.fn() as NextFunction;
  return { req, res, next };
}

describe("updateProfile handler (unit)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetProfile.mockResolvedValue({ id: "user-1" });
  });

  it("updates profile fields", async () => {
    const profile = {
      id: "user-1",
      fullName: "David Kingsley",
      email: "david@example.com",
      phone: "+234706975544",
      location: "Lagos, Nigeria",
      profilePhoto: null,
      role: "AGENT",
    };
    mockedUpdateProfile.mockResolvedValue(profile);
    const { req, res, next } = buildMockReqRes({
      fullName: " David Kingsley ",
      phone: "+234706975544",
      location: "Lagos, Nigeria",
    });

    await updateProfile(req, res, next);

    expect(mockedUpdateProfile).toHaveBeenCalledWith("user-1", {
      fullName: "David Kingsley",
      phone: "+234706975544",
      location: "Lagos, Nigeria",
    });
    expect(res.status).toHaveBeenCalledWith(HttpStatusCode.OK);
    expect(res.json).toHaveBeenCalledWith(profile);
  });

  it("rejects an empty update", async () => {
    const { req, res, next } = buildMockReqRes();
    await updateProfile(req, res, next);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.BAD_REQUEST }),
    );
    expect(mockedUpdateProfile).not.toHaveBeenCalled();
  });
});
