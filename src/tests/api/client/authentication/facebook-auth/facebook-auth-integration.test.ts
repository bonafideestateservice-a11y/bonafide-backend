const verifyFacebookAccessToken = jest.fn();

// Only the call to Facebook is stubbed; everything else is the real app and database.
jest.mock("../../../../../libs/facebook/facebook", () => ({ verifyFacebookAccessToken }));

import request from "supertest";
import app from "../../../../../app";
import { UnauthorizedError } from "../../../../../exceptions";
import { prismaClient } from "../../../../../utils/prisma";

const suffix = Date.now();
const emails = {
  newUser: `facebook-new-${suffix}@example.com`,
  existing: `facebook-existing-${suffix}@example.com`,
  agent: `facebook-agent-${suffix}@example.com`,
};

const profile = (providerId: string, email: string | null) => ({
  provider: "facebook",
  providerId: `${providerId}-${suffix}`,
  email,
  emailVerified: !!email,
  fullName: "Facebook Test User",
  picture: null,
});

const signIn = (body: object) => request(app).post("/api/v1/client/auth/facebook/token").send(body);

beforeAll(async () => {
  await prismaClient.user.createMany({
    data: [
      { fullName: "Existing Client", email: emails.existing, password: "hashed", role: "CLIENT" },
      { fullName: "Existing Agent", email: emails.agent, password: "hashed", role: "AGENT" },
    ],
  });
});

afterAll(async () => {
  await prismaClient.user.deleteMany({ where: { email: { in: Object.values(emails) } } });
  await prismaClient.$disconnect();
});

beforeEach(() => {
  verifyFacebookAccessToken.mockReset();
});

describe("POST /api/v1/client/auth/facebook/token", () => {
  it("creates a client on first sign-in and returns an API token that works", async () => {
    verifyFacebookAccessToken.mockResolvedValue(profile("fb-new", emails.newUser));

    const response = await signIn({ accessToken: "fb-token" });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      message: "Login successful.",
      token: expect.any(String),
      isNewUser: true,
      user: { email: emails.newUser, role: "CLIENT", provider: "facebook" },
    });

    const profileResponse = await request(app)
      .get("/api/v1/client/profile")
      .set("Authorization", `Bearer ${response.body.token}`);
    expect(profileResponse.status).toBe(200);
  });

  it("signs the same Facebook account into the same user next time", async () => {
    verifyFacebookAccessToken.mockResolvedValue(profile("fb-new", emails.newUser));

    const response = await signIn({ accessToken: "fb-token" });

    expect(response.status).toBe(200);
    expect(response.body.isNewUser).toBe(false);
  });

  it("links an existing password account with the same email", async () => {
    verifyFacebookAccessToken.mockResolvedValue(profile("fb-existing", emails.existing));

    const response = await signIn({ accessToken: "fb-token" });

    expect(response.status).toBe(200);
    const user = await prismaClient.user.findUniqueOrThrow({ where: { email: emails.existing } });
    expect(user).toMatchObject({ provider: "facebook", providerId: `fb-existing-${suffix}` });
  });

  it("refuses to sign into an agent account", async () => {
    verifyFacebookAccessToken.mockResolvedValue(profile("fb-agent", emails.agent));

    const response = await signIn({ accessToken: "fb-token" });

    expect(response.status).toBe(403);
  });

  it("returns 400 when the Facebook account shared no email", async () => {
    verifyFacebookAccessToken.mockResolvedValue(profile("fb-no-email", null));

    const response = await signIn({ accessToken: "fb-token" });

    expect(response.status).toBe(400);
  });

  it("returns 401 for a token Facebook rejects", async () => {
    verifyFacebookAccessToken.mockRejectedValue(
      new UnauthorizedError("Invalid Facebook access token."),
    );

    const response = await signIn({ accessToken: "forged" });

    expect(response.status).toBe(401);
  });

  it("no longer serves the old redirect endpoints", async () => {
    const responses = await Promise.all(
      ["", "/callback", "/success", "/error", "/logout"].map((path) =>
        request(app).get(`/api/v1/client/auth/facebook${path}`),
      ),
    );

    expect(responses.map((response) => response.status)).toEqual([404, 404, 404, 404, 404]);
  });
});
