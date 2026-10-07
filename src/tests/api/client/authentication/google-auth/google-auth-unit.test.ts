const verifyGoogleIdToken = jest.fn();
const signInWithSocialProfile = jest.fn();

jest.mock("../../../../../libs/google/google", () => ({ verifyGoogleIdToken }));
jest.mock("../../../../../api/client/authentication/services/social-auth", () => ({
  signInWithSocialProfile,
}));
jest.mock("../../../../../utils/jwt", () => ({ generateToken: jest.fn(() => "api-jwt") }));
jest.mock("../../../../../utils/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { NextFunction, Request, Response } from "express";
import { googleSignIn } from "../../../../../api/client/authentication/handlers/google-auth";
import { HttpStatusCode, UnauthorizedError } from "../../../../../exceptions";

const buildReqRes = (body: unknown) => {
  const req = { body } as unknown as Request;
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response;
  return { req, res, next: jest.fn() as NextFunction };
};

const profile = { provider: "google", providerId: "google-123", email: "ada@example.com" };
const user = { id: "user-1", email: "ada@example.com", password: null, role: "CLIENT" };

describe("googleSignIn handler (unit)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    verifyGoogleIdToken.mockResolvedValue(profile);
    signInWithSocialProfile.mockResolvedValue({ kind: "SIGNED_IN", user, created: true });
  });

  it("exchanges a Google ID token for an API token, like /login", async () => {
    const { req, res, next } = buildReqRes({
      idToken: " google-id-token ",
      termsAndCondition: true,
    });

    await googleSignIn(req, res, next);

    expect(verifyGoogleIdToken).toHaveBeenCalledWith("google-id-token");
    expect(signInWithSocialProfile).toHaveBeenCalledWith(profile, { termsAndCondition: true });
    expect(res.status).toHaveBeenCalledWith(HttpStatusCode.OK);
    expect(res.json).toHaveBeenCalledWith({
      message: "Login successful.",
      token: "api-jwt",
      user: { id: "user-1", email: "ada@example.com", role: "CLIENT" },
      isNewUser: true,
    });
  });

  it("only stores terms acceptance when it's exactly true", async () => {
    const { req, res, next } = buildReqRes({ idToken: "token", termsAndCondition: "yes" });

    await googleSignIn(req, res, next);

    expect(signInWithSocialProfile).toHaveBeenCalledWith(profile, { termsAndCondition: false });
  });

  it.each([[{}], [{ idToken: "   " }], [{ idToken: 42 }], [{ accessToken: "wrong" }], [undefined]])(
    "returns 400 without a valid idToken (%j)",
    async (body) => {
      const { req, res, next } = buildReqRes(body);

      await googleSignIn(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatusCode.BAD_REQUEST,
          message: "idToken is required.",
        }),
      );
      expect(verifyGoogleIdToken).not.toHaveBeenCalled();
    },
  );

  it("returns 401 for a token Google rejects", async () => {
    verifyGoogleIdToken.mockRejectedValue(new UnauthorizedError("Invalid Google ID token."));
    const { req, res, next } = buildReqRes({ idToken: "bad" });

    await googleSignIn(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.UNAUTHORIZED }),
    );
    expect(signInWithSocialProfile).not.toHaveBeenCalled();
  });

  it.each([
    [{ kind: "EMAIL_REQUIRED" }, HttpStatusCode.BAD_REQUEST],
    [{ kind: "EMAIL_NOT_VERIFIED" }, HttpStatusCode.CONFLICT],
    [{ kind: "NOT_A_CLIENT" }, HttpStatusCode.FORBIDDEN],
  ])("maps %j to %s", async (result, statusCode) => {
    signInWithSocialProfile.mockResolvedValue(result);
    const { req, res, next } = buildReqRes({ idToken: "token" });

    await googleSignIn(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode }));
    expect(res.json).not.toHaveBeenCalled();
  });

  it("returns 500 for unexpected failures", async () => {
    signInWithSocialProfile.mockRejectedValue(new Error("database down"));
    const { req, res, next } = buildReqRes({ idToken: "token" });

    await googleSignIn(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatusCode.INTERNAL_SERVER }),
    );
  });
});
