const verifyGoogleIdToken = jest.fn();

// Only the call to Google is stubbed; everything else is the real app and database.
jest.mock("../../../../../libs/google/google", () => ({ verifyGoogleIdToken }));

import request from "supertest";
import app from "../../../../../app";
import { UnauthorizedError } from "../../../../../exceptions";
import { prismaClient } from "../../../../../utils/prisma";

const suffix = Date.now();
const emails = {
  newUser: `google-new-${suffix}@example.com`,
  existing: `google-existing-${suffix}@example.com`,
  admin: `google-admin-${suffix}@example.com`,
};

const profile = (providerId: string, email: string | null, emailVerified = true) => ({
  provider: "google",
  providerId: `${providerId}-${suffix}`,
  email,
  emailVerified,
  fullName: "Google Test User",
  picture: "https://cdn.test/avatar.jpg",
});

const signIn = (body: object) => request(app).post("/api/v1/client/auth/google/token").send(body);

beforeAll(async () => {
  await prismaClient.user.createMany({
    data: [
      { fullName: "Existing Client", email: emails.existing, password: "hashed", role: "CLIENT" },
      { fullName: "Existing Admin", email: emails.admin, password: "hashed", role: "ADMIN" },
    ],
  });
});

afterAll(async () => {
  await prismaClient.user.deleteMany({ where: { email: { in: Object.values(emails) } } });
  await prismaClient.$disconnect();
});

beforeEach(() => {
  verifyGoogleIdToken.mockReset();
});

describe("POST /api/v1/client/auth/google/token", () => {
  it("creates a client on first sign-in and returns an API token that works", async () => {
    verifyGoogleIdToken.mockResolvedValue(profile("g-new", emails.newUser));

    const response = await signIn({ idToken: "google-id-token", termsAndCondition: true });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      message: "Login successful.",
      token: expect.any(String),
      isNewUser: true,
      user: {
        email: emails.newUser,
        role: "CLIENT",
        provider: "google",
        profilePhoto: "https://cdn.test/avatar.jpg",
        termsAndCondition: true,
      },
    });
    expect(response.body.user).not.toHaveProperty("password");

    // The JWT is accepted by protected endpoints, like one from /login.
    const profileResponse = await request(app)
      .get("/api/v1/client/profile")
      .set("Authorization", `Bearer ${response.body.token}`);
    expect(profileResponse.status).toBe(200);
  });

  it("signs the same Google account into the same user next time", async () => {
    verifyGoogleIdToken.mockResolvedValue(profile("g-new", emails.newUser));

    const response = await signIn({ idToken: "google-id-token" });

    expect(response.status).toBe(200);
    expect(response.body.isNewUser).toBe(false);
    expect(await prismaClient.user.count({ where: { email: emails.newUser } })).toBe(1);
  });

  it("refuses to link an existing account when Google hasn't verified the email", async () => {
    verifyGoogleIdToken.mockResolvedValue(profile("g-unverified", emails.existing, false));

    const response = await signIn({ idToken: "google-id-token" });

    expect(response.status).toBe(409);
    const user = await prismaClient.user.findUniqueOrThrow({ where: { email: emails.existing } });
    expect(user.providerId).toBeNull();
  });

  it("links an existing password account with the same verified email", async () => {
    verifyGoogleIdToken.mockResolvedValue(profile("g-existing", emails.existing));

    const response = await signIn({ idToken: "google-id-token" });

    expect(response.status).toBe(200);
    const user = await prismaClient.user.findUniqueOrThrow({ where: { email: emails.existing } });
    expect(user).toMatchObject({
      provider: "google",
      providerId: `g-existing-${suffix}`,
      password: "hashed",
    });
  });

  it("refuses to sign into an admin account", async () => {
    verifyGoogleIdToken.mockResolvedValue(profile("g-admin", emails.admin));

    const response = await signIn({ idToken: "google-id-token" });

    expect(response.status).toBe(403);
    const admin = await prismaClient.user.findUniqueOrThrow({ where: { email: emails.admin } });
    expect(admin.providerId).toBeNull();
  });

  it("returns 401 for a token Google rejects", async () => {
    verifyGoogleIdToken.mockRejectedValue(new UnauthorizedError("Invalid Google ID token."));

    const response = await signIn({ idToken: "forged" });

    expect(response.status).toBe(401);
  });

  it("returns 400 without an idToken", async () => {
    const response = await signIn({});

    expect(response.status).toBe(400);
    expect(verifyGoogleIdToken).not.toHaveBeenCalled();
  });

  it("no longer serves the old redirect endpoints", async () => {
    const responses = await Promise.all(
      ["", "/callback", "/success", "/error", "/logout"].map((path) =>
        request(app).get(`/api/v1/client/auth/google${path}`),
      ),
    );

    expect(responses.map((response) => response.status)).toEqual([404, 404, 404, 404, 404]);
  });
});
