const graphGet = jest.fn();

jest.mock("axios", () => {
  const actual = jest.requireActual("axios");
  const axios = { ...actual.default, create: () => ({ get: graphGet }) };
  return { __esModule: true, ...actual, default: axios };
});

import crypto from "crypto";
import { AxiosError, AxiosHeaders } from "axios";
import { verifyFacebookAccessToken } from "../../libs/facebook/facebook";

const debugToken = (data: Record<string, unknown>) => ({ data: { data } });
const graphError = (status: number) =>
  new AxiosError("Request failed", "ERR_BAD_REQUEST", undefined, undefined, {
    status,
    statusText: "",
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: {},
  });

describe("verifyFacebookAccessToken", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.FACEBOOK_CLIENT_ID = "app-123";
    process.env.FACEBOOK_SECRET_KEY = "app-secret";
  });

  it("checks the token belongs to our app, then returns the profile", async () => {
    graphGet
      .mockResolvedValueOnce(debugToken({ is_valid: true, app_id: "app-123", user_id: "fb-1" }))
      .mockResolvedValueOnce({
        data: {
          id: "fb-1",
          name: "Ada Okafor",
          email: "Ada@Example.com",
          picture: { data: { url: "https://graph.facebook.com/photo.jpg", is_silhouette: false } },
        },
      });

    await expect(verifyFacebookAccessToken("user-token")).resolves.toEqual({
      provider: "facebook",
      providerId: "fb-1",
      email: "ada@example.com",
      emailVerified: true,
      fullName: "Ada Okafor",
      picture: "https://graph.facebook.com/photo.jpg",
    });
    expect(graphGet).toHaveBeenNthCalledWith(1, "/debug_token", {
      params: { input_token: "user-token", access_token: "app-123|app-secret" },
    });
    expect(graphGet).toHaveBeenNthCalledWith(2, "/me", {
      params: expect.objectContaining({
        access_token: "user-token",
        appsecret_proof: crypto
          .createHmac("sha256", "app-secret")
          .update("user-token")
          .digest("hex"),
      }),
    });
  });

  it("treats a missing email as unverified and drops the default silhouette", async () => {
    graphGet
      .mockResolvedValueOnce(debugToken({ is_valid: true, app_id: "app-123", user_id: "fb-1" }))
      .mockResolvedValueOnce({
        data: {
          id: "fb-1",
          first_name: "Ada",
          last_name: "O",
          picture: { data: { url: "https://x/default.jpg", is_silhouette: true } },
        },
      });

    await expect(verifyFacebookAccessToken("user-token")).resolves.toMatchObject({
      email: null,
      emailVerified: false,
      fullName: "Ada O",
      picture: null,
    });
  });

  it.each([
    ["an invalid token", { is_valid: false, app_id: "app-123", user_id: "fb-1" }],
    ["a token issued for another app", { is_valid: true, app_id: "other-app", user_id: "fb-1" }],
  ])("rejects %s without loading the profile", async (_label, data) => {
    graphGet.mockResolvedValueOnce(debugToken(data));

    await expect(verifyFacebookAccessToken("user-token")).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(graphGet).toHaveBeenCalledTimes(1);
  });

  it("rejects a token Facebook refuses", async () => {
    graphGet.mockRejectedValueOnce(graphError(400));

    await expect(verifyFacebookAccessToken("expired")).rejects.toMatchObject({ statusCode: 401 });
  });

  it("passes Facebook outages through as errors, not as a bad token", async () => {
    graphGet.mockRejectedValueOnce(graphError(503));

    await expect(verifyFacebookAccessToken("user-token")).rejects.toBeInstanceOf(AxiosError);
  });

  it("fails clearly when Facebook sign-in isn't configured", async () => {
    delete process.env.FACEBOOK_SECRET_KEY;

    await expect(verifyFacebookAccessToken("user-token")).rejects.toThrow(
      "FACEBOOK_CLIENT_ID and FACEBOOK_SECRET_KEY are required for Facebook sign-in",
    );
  });
});
