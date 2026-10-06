import { SendMailClient } from "zeptomail";
import { logger } from "../../utils/logger";

const url = process.env.ZEPTO_URL || "api.zeptomail.com";
const token = process.env.ZEPTO_TOKEN;

if (!token) {
  logger.warn("ZEPTO_TOKEN is not configured");
}

const client = new SendMailClient({ url, token: token || "" });

const defaultFrom = {
  address: process.env.ZEPTO_FROM_EMAIL || "noreply@juyonna.com",
  name: process.env.ZEPTO_FROM_NAME || "noreply",
};

export async function clientSendMailWithTemplate({
  mail_template_key,
  email_address,
  name,
  merge_info,
}: {
  mail_template_key: string;
  email_address: string;
  name?: string;
  merge_info: Record<string, any>;
}) {
  try {
    const response = await client.sendMailWithTemplate({
      mail_template_key,
      from: defaultFrom,
      to: [
        {
          email_address: {
            address: email_address,
            name: name || email_address,
          },
        },
      ],
      merge_info,
    });

    logger.info("ZeptoMail sent successfully", {
      to: email_address,
      mail_template_key,
      response,
    });

    return response;
  } catch (error) {
    logger.error("ZeptoMail send error", {
      to: email_address,
      mail_template_key,
      error,
    });
    throw error;
  }
}
