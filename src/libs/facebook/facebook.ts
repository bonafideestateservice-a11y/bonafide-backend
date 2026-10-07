import crypto from "crypto";
import axios from "axios";
import { UnauthorizedError } from "../../exceptions";
import { SocialProfile } from "../../types/social-auth";
import { facebookGraph, getFacebookAppCredentials } from "./index";

type DebugTokenResponse = {
  data: { is_valid?: boolean; app_id?: string; user_id?: string };
};

type FacebookUser = {
  id: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  picture?: { data?: { url?: string; is_silhouette?: boolean } };
};

/** Graph API rejects bad or expired user tokens with 4xx; anything else is our problem. */
const isRejectedToken = (error: unknown) =>
  axios.isAxiosError(error) &&
  !!error.response &&
  error.response.status >= 400 &&
  error.response.status < 500;

/**
 * Verify a Facebook user access token (from the Facebook JS or mobile SDK): that it's valid
 * and was issued for our app, then load the user's profile. Throws UnauthorizedError when the
 * token isn't valid.
 */
export async function verifyFacebookAccessToken(accessToken: string): Promise<SocialProfile> {
  const { appId, appSecret } = getFacebookAppCredentials();

  try {
    // A token from any Facebook app would load a profile, so first confirm it's ours.
    const { data: debug } = await facebookGraph.get<DebugTokenResponse>("/debug_token", {
      params: { input_token: accessToken, access_token: `${appId}|${appSecret}` },
    });
    if (!debug.data.is_valid || debug.data.app_id !== appId || !debug.data.user_id) {
      throw new UnauthorizedError("Invalid Facebook access token.");
    }

    const { data: user } = await facebookGraph.get<FacebookUser>("/me", {
      params: {
        fields: "id,name,first_name,last_name,email,picture.type(large)",
        access_token: accessToken,
        appsecret_proof: crypto.createHmac("sha256", appSecret).update(accessToken).digest("hex"),
      },
    });
    if (user.id !== debug.data.user_id) {
      throw new UnauthorizedError("Invalid Facebook access token.");
    }

    const email = user.email?.toLowerCase().trim() || null;
    const picture = user.picture?.data;
    return {
      provider: "facebook",
      providerId: user.id,
      email,
      // Facebook only returns an email the user has confirmed with Facebook.
      emailVerified: !!email,
      fullName:
        user.name?.trim() ||
        [user.first_name, user.last_name].filter(Boolean).join(" ").trim() ||
        email?.split("@")[0] ||
        "Facebook user",
      picture: picture?.url && !picture.is_silhouette ? picture.url : null,
    };
  } catch (error) {
    if (error instanceof UnauthorizedError) throw error;
    if (isRejectedToken(error)) throw new UnauthorizedError("Invalid Facebook access token.");
    throw error;
  }
}
