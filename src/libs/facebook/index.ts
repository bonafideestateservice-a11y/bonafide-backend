import axios from "axios";

const graphVersion = process.env.FACEBOOK_GRAPH_API_VERSION || "v21.0";

export const facebookGraph = axios.create({
  baseURL: `https://graph.facebook.com/${graphVersion}`,
  timeout: 10000,
});

export function getFacebookAppCredentials() {
  const appId = process.env.FACEBOOK_CLIENT_ID;
  const appSecret = process.env.FACEBOOK_SECRET_KEY;
  if (!appId || !appSecret) {
    throw new Error("FACEBOOK_CLIENT_ID and FACEBOOK_SECRET_KEY are required for Facebook sign-in");
  }
  return { appId, appSecret };
}
