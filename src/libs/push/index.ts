import { logger } from "../../utils/logger";

export const sendPushNotification = async (token: string, title: string, body: string) => {
  // TODO: integrate with a push provider (e.g. Firebase Cloud Messaging, OneSignal)
  logger.info(`[push] to=${token} title="${title}"`);

  return { token, title, body, sent: true };
};
