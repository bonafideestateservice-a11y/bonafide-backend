import { logger } from "../../utils/logger";

export const sendEmail = async (to: string, subject: string, body: string) => {
  // TODO: integrate with an email provider (e.g. SendGrid, SES, Postmark)
  logger.info(`[email] to=${to} subject="${subject}"`);

  return { to, subject, body, sent: true };
};
