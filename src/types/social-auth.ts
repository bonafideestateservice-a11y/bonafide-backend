export type SocialProvider = "google" | "facebook";

/** A user's identity as confirmed by Google or Facebook from a verified token. */
export interface SocialProfile {
  provider: SocialProvider;
  /** The provider's stable user ID (Google `sub`, Facebook user ID). */
  providerId: string;
  email: string | null;
  /** Whether the provider has confirmed the user owns `email`. */
  emailVerified: boolean;
  fullName: string;
  picture: string | null;
}
