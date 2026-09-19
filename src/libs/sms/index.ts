import { logger } from "../../utils/logger";

export const sendSms = async (to: string, message: string) => {
  // TODO: integrate with an SMS provider (e.g. Twilio, MessageBird)
  logger.info(`[sms] to=${to} message="${message}"`);

  return { to, message, sent: true };
};
