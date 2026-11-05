export const premiumQuoteReviewUrl = (verificationRequestId: string) => {
  const appUrl = process.env.CLIENT_APP_URL?.trim();
  if (!appUrl) throw new Error("CLIENT_APP_URL is required for Premium quote links");

  const base = new URL(appUrl);
  if (base.protocol !== "https:" && base.hostname !== "localhost") {
    throw new Error("CLIENT_APP_URL must use HTTPS");
  }
  base.search = "";
  base.hash = "";
  base.pathname = `${base.pathname.replace(/\/+$/, "")}/`;
  return new URL(
    `verification-requests/${encodeURIComponent(verificationRequestId)}/quote`,
    base,
  ).toString();
};
