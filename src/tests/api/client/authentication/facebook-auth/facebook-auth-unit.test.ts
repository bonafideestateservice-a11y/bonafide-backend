const verifyFacebookAccessToken = jest.fn();
const signInWithSocialProfile = jest.fn();

jest.mock("../../../../../libs/facebook/facebook", () => ({ verifyFacebookAccessToken }));
jest.mock("../../../../../api/client/authentication/services/social-auth", () => ({
  signInWithSocialProfile,
}));
jest.mock("../../../../../utils/jwt", () => ({ generateToken: jest.fn(() => "api-jwt") }));
jest.mock("../../../../../utils/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { NextFunction, Request, Response } from "express";
import { facebookSignIn } from "../../../../../api/client/authentication/handlers/facebook-auth";
import { HttpStatusCode, UnauthorizedError } from "../../../../../exceptions";

const buildReqRes = (body: unknown) => {
  const req = { body } as unknown as Request;
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response;
  return { req, res, next: jest.fn() as NextFunction };
};

const profile = { provider: "facebook", providerId: "fb-1", email: "ada@example.com" };
const user = { id: "user-1", email: "ada@example.com", password: "hashed", role: "CLIENT" };

describe("facebookSignIn handler (unit)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    verifyFacebookAccessToken.mockResolvedValue(profile);
    signInWithSocialProfile.mockResolvedValue({ kind: "SIGNED_IN", user, created: false });
  });

  it("exchanges a Facebook access token for an API token, like /login", async () => {
    const { req, res, next } = buildReqRes({ accessToken: " fb-token " });

    await facebookSignIn(req, res, next);

    expect(verifyFacebookAccessToken).toHaveBeenCalledWith("fb-token");
    expect(signInWithSocialProfile).toHaveBeenCalledWith(profile, { termsAndCondition: false });
    expect(res.status).toHaveBeenCalledWith(HttpStatusCode.OK);
    // The password hash is never returned.
    expect(res.json).toHaveBeenCalledWith({
      message: "Login successful.",
      token: "api-jwt",
      user: { id: "user-1", email: "ada@example.com", role: "CLIENT" },
      isNewUser: false,
    });
  });

  it.each([[{}], [{ accessToken: "" }], [{ idToken: "wrong" }], [undefined]])(
    "returns 400 without a valid accessToken (%j)",
    async (body) => {
      const { req, res, next } = buildReqRes(body);

      await facebookSignIn(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatusCode.BAD_REQUEST,
          message: "accessToken is required.",
        }),
      );
      expect(verifyFacebookAccessToken).not.toHaveBeenCalled();
    },
  );

  it("returns 401 for a token Facebook rejects or that belongs to another app", async () => {
    verifyFacebookAccessToken.mockRejectedValue(
      new UnauthorizedError("Invalid Facebook access token."),
    );
    const { req, res, next } = buildReqRes({ accessToken: "bad" });

    await facebookSignIn(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.UNAUTHORIZED }),
    );
  });

  it.each([
    [{ kind: "EMAIL_REQUIRED" }, HttpStatusCode.BAD_REQUEST],
    [{ kind: "EMAIL_NOT_VERIFIED" }, HttpStatusCode.CONFLICT],
    [{ kind: "NOT_A_CLIENT" }, HttpStatusCode.FORBIDDEN],
  ])("maps %j to %s", async (result, statusCode) => {
    signInWithSocialProfile.mockResolvedValue(result);
    const { req, res, next } = buildReqRes({ accessToken: "fb-token" });

    await facebookSignIn(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode }));
    expect(res.json).not.toHaveBeenCalled();
  });

  it("returns 500 for unexpected failures such as a Facebook outage", async () => {
    verifyFacebookAccessToken.mockRejectedValue(new Error("socket hang up"));
    const { req, res, next } = buildReqRes({ accessToken: "fb-token" });

    await facebookSignIn(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.INTERNAL_SERVER }),
    );
  });
});
