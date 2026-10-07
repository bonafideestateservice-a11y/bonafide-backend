const verifyIdToken = jest.fn();

jest.mock("google-auth-library", () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({ verifyIdToken })),
}));

import { verifyGoogleIdToken } from "../../libs/google/google";

const ticket = (payload: Record<string, unknown> | undefined) => ({ getPayload: () => payload });

describe("verifyGoogleIdToken", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GOOGLE_CLIENT_ID = "web-client-id";
    delete process.env.GOOGLE_ADDITIONAL_CLIENT_IDS;
  });

  it("returns the verified profile, checked against our client IDs", async () => {
    process.env.GOOGLE_ADDITIONAL_CLIENT_IDS = "ios-client-id, android-client-id";
    verifyIdToken.mockResolvedValue(
      ticket({
        sub: "google-123",
        email: "Ada@Example.com",
        email_verified: true,
        name: "Ada Okafor",
        picture: "https://lh3.googleusercontent.com/a/photo",
      }),
    );

    await expect(verifyGoogleIdToken("id-token")).resolves.toEqual({
      provider: "google",
      providerId: "google-123",
      email: "ada@example.com",
      emailVerified: true,
      fullName: "Ada Okafor",
      picture: "https://lh3.googleusercontent.com/a/photo",
    });
    expect(verifyIdToken).toHaveBeenCalledWith({
      idToken: "id-token",
      audience: ["web-client-id", "ios-client-id", "android-client-id"],
    });
  });

  it("reports an unverified email and builds a name from its parts", async () => {
    verifyIdToken.mockResolvedValue(
      ticket({ sub: "google-123", email: "ada@example.com", given_name: "Ada", family_name: "O" }),
    );

    await expect(verifyGoogleIdToken("id-token")).resolves.toMatchObject({
      emailVerified: false,
      fullName: "Ada O",
      picture: null,
    });
  });

  it("rejects a token Google won't verify", async () => {
    verifyIdToken.mockRejectedValue(
      new Error("Wrong recipient, payload audience != requiredAudience"),
    );

    await expect(verifyGoogleIdToken("id-token")).rejects.toMatchObject({
      statusCode: 401,
      message: "Invalid Google ID token.",
    });
  });

  it("fails clearly when Google sign-in isn't configured", async () => {
    delete process.env.GOOGLE_CLIENT_ID;

    await expect(verifyGoogleIdToken("id-token")).rejects.toThrow(
      "GOOGLE_CLIENT_ID is required for Google sign-in",
    );
    expect(verifyIdToken).not.toHaveBeenCalled();
  });
});
