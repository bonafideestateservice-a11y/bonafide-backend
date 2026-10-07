import { UnauthorizedError } from "../../exceptions";
import { SocialProfile } from "../../types/social-auth";
import { getGoogleClient, getGoogleClientIds } from "./index";

/**
 * Verify a Google ID token (from Google Identity Services on the web, or the Google Sign-In
 * SDKs on mobile): its signature, expiry, issuer, and that it was issued for one of our
 * client IDs. Throws UnauthorizedError when the token isn't valid.
 */
export async function verifyGoogleIdToken(idToken: string): Promise<SocialProfile> {
  const audience = getGoogleClientIds();

  let payload;
  try {
    const ticket = await getGoogleClient().verifyIdToken({ idToken, audience });
    payload = ticket.getPayload();
  } catch {
    throw new UnauthorizedError("Invalid Google ID token.");
  }
  if (!payload?.sub) {
    throw new UnauthorizedError("Invalid Google ID token.");
  }

  const email = payload.email?.toLowerCase().trim() || null;
  return {
    provider: "google",
    providerId: payload.sub,
    email,
    emailVerified: payload.email_verified === true,
    fullName:
      payload.name?.trim() ||
      [payload.given_name, payload.family_name].filter(Boolean).join(" ").trim() ||
      email?.split("@")[0] ||
      "Google user",
    picture: payload.picture ?? null,
  };
}
