const findClient = jest.fn();
const createClient = jest.fn();
const updateClient = jest.fn();
const emit = jest.fn();

jest.mock("../../../../../api/client/authentication/services/database/client", () => ({
  findClient,
  createClient,
  updateClient,
}));
jest.mock("../../../../../events", () => ({
  appEvents: { emit },
  AppEventTypes: { USER_REGISTERED: "USER_REGISTERED" },
}));
jest.mock("../../../../../utils/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { signInWithSocialProfile } from "../../../../../api/client/authentication/services/social-auth";
import { SocialProfile } from "../../../../../types/social-auth";

const profile: SocialProfile = {
  provider: "google",
  providerId: "google-123",
  email: "ada@example.com",
  emailVerified: true,
  fullName: "Ada Okafor",
  picture: "https://photo",
};

const user = (overrides: Record<string, unknown> = {}) => ({
  id: "user-1",
  email: "ada@example.com",
  fullName: "Ada Okafor",
  role: "CLIENT",
  provider: "local",
  providerId: null,
  profilePhoto: null,
  ...overrides,
});

describe("signInWithSocialProfile", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    findClient.mockResolvedValue(null);
    updateClient.mockImplementation(async (_where, data) => user(data));
    createClient.mockImplementation(async (data) => user({ id: "user-new", ...data }));
  });

  it("signs in the account already linked to this provider ID", async () => {
    findClient.mockResolvedValueOnce(user({ provider: "google", providerId: "google-123" }));

    const result = await signInWithSocialProfile(profile);

    expect(findClient).toHaveBeenCalledWith({ providerId: "google-123" });
    expect(result).toMatchObject({ kind: "SIGNED_IN", created: false, user: { id: "user-1" } });
    expect(findClient).toHaveBeenCalledTimes(1);
    expect(updateClient).not.toHaveBeenCalled();
  });

  it("finds a linked account even after the user changed their email", async () => {
    findClient.mockResolvedValueOnce(
      user({ email: "new@example.com", provider: "google", providerId: "google-123" }),
    );

    const result = await signInWithSocialProfile(profile);

    expect(result).toMatchObject({ kind: "SIGNED_IN", user: { email: "new@example.com" } });
  });

  it("links an existing client with the same verified email", async () => {
    findClient.mockResolvedValueOnce(null).mockResolvedValueOnce(user());

    const result = await signInWithSocialProfile(profile);

    expect(findClient).toHaveBeenNthCalledWith(2, { email: "ada@example.com" });
    expect(updateClient).toHaveBeenCalledWith(
      { id: "user-1" },
      { provider: "google", providerId: "google-123", profilePhoto: "https://photo" },
    );
    expect(result).toMatchObject({ kind: "SIGNED_IN", created: false });
  });

  it("keeps an existing profile photo when linking", async () => {
    findClient
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(user({ profilePhoto: "mine.jpg" }));

    await signInWithSocialProfile(profile);

    expect(updateClient).toHaveBeenCalledWith(
      { id: "user-1" },
      { provider: "google", providerId: "google-123" },
    );
  });

  it("refuses to link an existing account when the provider hasn't verified the email", async () => {
    findClient.mockResolvedValueOnce(null).mockResolvedValueOnce(user());

    const result = await signInWithSocialProfile({ ...profile, emailVerified: false });

    expect(result).toEqual({ kind: "EMAIL_NOT_VERIFIED" });
    expect(updateClient).not.toHaveBeenCalled();
  });

  it.each(["ADMIN", "AGENT"])("refuses %s accounts", async (role) => {
    findClient.mockResolvedValueOnce(null).mockResolvedValueOnce(user({ role }));

    await expect(signInWithSocialProfile(profile)).resolves.toEqual({ kind: "NOT_A_CLIENT" });
    expect(updateClient).not.toHaveBeenCalled();
  });

  it("refuses staff accounts already linked to the provider", async () => {
    findClient.mockResolvedValueOnce(
      user({ role: "ADMIN", provider: "google", providerId: "google-123" }),
    );

    await expect(signInWithSocialProfile(profile)).resolves.toEqual({ kind: "NOT_A_CLIENT" });
  });

  it("creates a client on first sign-in and announces the registration", async () => {
    const result = await signInWithSocialProfile(profile, { termsAndCondition: true });

    expect(createClient).toHaveBeenCalledWith({
      fullName: "Ada Okafor",
      email: "ada@example.com",
      password: null,
      role: "CLIENT",
      provider: "google",
      providerId: "google-123",
      profilePhoto: "https://photo",
      termsAndCondition: true,
    });
    expect(emit).toHaveBeenCalledWith("USER_REGISTERED", {
      userId: "user-new",
      email: "ada@example.com",
      firstName: "Ada Okafor",
    });
    expect(result).toMatchObject({ kind: "SIGNED_IN", created: true });
  });

  it("can't create an account without an email", async () => {
    await expect(
      signInWithSocialProfile({ ...profile, email: null, emailVerified: false }),
    ).resolves.toEqual({ kind: "EMAIL_REQUIRED" });
    expect(createClient).not.toHaveBeenCalled();
  });
});
