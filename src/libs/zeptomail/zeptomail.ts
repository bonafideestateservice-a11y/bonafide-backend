import { clientSendMailWithTemplate } from "./index";
import { EmailContent, getEmailTemplateKey } from "./templates";

export class EmailTemplateNotConfiguredError extends Error {
  constructor(template: string) {
    super(`Email template ${template} is not configured (set ZEPTO_TEMPLATE_${template})`);
    this.name = "EmailTemplateNotConfiguredError";
  }
}

export interface SendTemplateEmailParams {
  to: { email: string; name: string };
  content: EmailContent;
}

export async function sendTemplateEmail({ to, content }: SendTemplateEmailParams) {
  const templateKey = getEmailTemplateKey(content.template);
  if (!templateKey) {
    throw new EmailTemplateNotConfiguredError(content.template);
  }

  return clientSendMailWithTemplate({
    mail_template_key: templateKey,
    email_address: to.email,
    name: to.name,
    merge_info: content.data,
  });
}
