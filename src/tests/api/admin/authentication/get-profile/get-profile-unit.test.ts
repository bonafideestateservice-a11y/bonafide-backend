import { NextFunction, Request, Response } from "express";
import { getProfile } from "../../../../../api/admin/authentication/handlers/get-profile";
import { getAdminProfile } from "../../../../../api/admin/authentication/services/database/admin";
import { HttpStatusCode } from "../../../../../exceptions";

jest.mock("../../../../../api/admin/authentication/services/database/admin");
jest.mock("../../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockedGetProfile = getAdminProfile as jest.Mock;

function buildMockReqRes(userId?: string) {
  const req = { user: userId ? { id: userId } : undefined } as unknown as Request;
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response;
  const next = jest.fn() as NextFunction;
  return { req, res, next };
}

describe("getProfile handler (unit)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns the authenticated profile", async () => {
    const profile = {
      id: "user-1",
      fullName: "David Miller",
      email: "david@example.com",
      phone: "+2347000000000",
      location: "Lagos, Nigeria",
      profilePhoto: "https://cdn.test/profile.jpg",
      role: "AGENT",
    };
    mockedGetProfile.mockResolvedValue(profile);
    const { req, res, next } = buildMockReqRes("user-1");

    await getProfile(req, res, next);

    expect(mockedGetProfile).toHaveBeenCalledWith("user-1");
    expect(res.status).toHaveBeenCalledWith(HttpStatusCode.OK);
    // Admins who never saved their settings get email and push.
    expect(res.json).toHaveBeenCalledWith({
      ...profile,
      notificationSettings: { email: true, sms: false, push: true },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns the saved notification settings", async () => {
    const notificationSettings = { email: false, sms: true, push: false };
    mockedGetProfile.mockResolvedValue({ id: "user-1", notificationSettings });
    const { req, res, next } = buildMockReqRes("user-1");

    await getProfile(req, res, next);

    expect(res.json).toHaveBeenCalledWith({ id: "user-1", notificationSettings });
  });

  it("returns 401 without authentication", async () => {
    const { req, res, next } = buildMockReqRes();
    await getProfile(req, res, next);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.UNAUTHORIZED }),
    );
  });
});
