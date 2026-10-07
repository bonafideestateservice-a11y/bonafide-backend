import { OAuth2Client } from "google-auth-library";

let googleClient: OAuth2Client | undefined;

export function getGoogleClient(): OAuth2Client {
  googleClient ??= new OAuth2Client();
  return googleClient;
}

/**
 * Client IDs whose ID tokens are accepted: GOOGLE_CLIENT_ID, plus any in
 * GOOGLE_ADDITIONAL_CLIENT_IDS (comma-separated), e.g. separate iOS/Android client IDs.
 */
export function getGoogleClientIds(): string[] {
  const ids = [
    process.env.GOOGLE_CLIENT_ID,
    ...(process.env.GOOGLE_ADDITIONAL_CLIENT_IDS ?? "").split(","),
  ]
    .map((id) => id?.trim())
    .filter((id): id is string => !!id);

  if (ids.length === 0) {
    throw new Error("GOOGLE_CLIENT_ID is required for Google sign-in");
  }
  return ids;
}
