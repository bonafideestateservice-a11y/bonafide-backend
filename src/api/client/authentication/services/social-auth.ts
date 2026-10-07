import { ROLE, User } from "@prisma/client";
import { appEvents, AppEventTypes } from "../../../../events";
import { logger } from "../../../../utils/logger";
import { SocialProfile } from "../../../../types/social-auth";
import { createClient, findClient, updateClient } from "./database/client";

export type SocialSignInResult =
  | { kind: "SIGNED_IN"; user: User; created: boolean }
  /** The provider didn't share an email, so there's no account to find or create. */
  | { kind: "EMAIL_REQUIRED" }
  /** An account uses this email, but the provider hasn't verified the user owns it. */
  | { kind: "EMAIL_NOT_VERIFIED" }
  /** Admin and agent accounts can't sign in through client social login. */
  | { kind: "NOT_A_CLIENT" };

/**
 * Find, link or create the client account for a verified social profile:
 * 1. An account already linked to this provider ID signs in.
 * 2. Otherwise an account with the same email is linked, only if the provider has verified
 *    the email (else anyone could claim an account by its address).
 * 3. Otherwise a new client account is created.
*/

export const signInWithSocialProfile = async (
  profile: SocialProfile,
  { termsAndCondition = false }: { termsAndCondition?: boolean } = {},
): Promise<SocialSignInResult> => {
  const linked = await findClient({ providerId: profile.providerId });
  if (linked && linked.provider === profile.provider) {
    if (linked.role !== ROLE.CLIENT) return { kind: "NOT_A_CLIENT" };
    return { kind: "SIGNED_IN", user: linked, created: false };
  }

  if (!profile.email) return { kind: "EMAIL_REQUIRED" };

  const existing = await findClient({ email: profile.email });
  if (existing) {
    if (existing.role !== ROLE.CLIENT) return { kind: "NOT_A_CLIENT" };
    if (!profile.emailVerified) return { kind: "EMAIL_NOT_VERIFIED" };

    // One provider link per user (User.providerId): signing in with the other provider
    // moves the link; either still works because the verified email matches.
    const user = await updateClient(
      { id: existing.id },
      {
        provider: profile.provider,
        providerId: profile.providerId,
        ...(existing.profilePhoto ? {} : { profilePhoto: profile.picture }),
      },
    );
    logger.info(`Linked ${profile.provider} sign-in to existing userId=${user.id}`);
    return { kind: "SIGNED_IN", user, created: false };
  }

  const user = await createClient({
    fullName: profile.fullName,
    email: profile.email,
    password: null,
    role: ROLE.CLIENT,
    provider: profile.provider,
    providerId: profile.providerId,
    profilePhoto: profile.picture,
    termsAndCondition,
  });
  appEvents.emit(AppEventTypes.USER_REGISTERED, {
    userId: user.id,
    email: user.email,
    firstName: user.fullName,
  });
  logger.info(`Created userId=${user.id} from ${profile.provider} sign-in`);
  return { kind: "SIGNED_IN", user, created: true };
};
