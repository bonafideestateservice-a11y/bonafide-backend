import { renderEmailHtml } from "./layout";
import { EmailContent, EmailTemplate, EmailTemplateData } from "./templates";

/**
 * Emails sent as HTML from here instead of a ZeptoMail template, so they need no template key.
 */
type HtmlEmailTemplate =
  EmailTemplate.USER_REGISTERED | EmailTemplate.FORGOT_PASSWORD | EmailTemplate.PAYMENT_RECEIVED;

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** Escapes every merge value, since names and other fields come from users. */
const escaped = <T extends object>(data: T) =>
  Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, escapeHtml(String(value ?? ""))]),
  ) as { [K in keyof T]: string };

const htmlEmails: {
  [K in HtmlEmailTemplate]: (data: EmailTemplateData[K]) => { subject: string; html: string };
} = {
  [EmailTemplate.USER_REGISTERED]: (data) => {
    const d = escaped(data);
    return {
      subject: `Welcome to Bonafide, ${data.firstName}`,
      html: renderEmailHtml({
        heading: "Welcome to Bonafide",
        paragraphs: [
          `Hi ${d.firstName},`,
          "Your account is ready. You can now verify, purchase and manage properties in Nigeria, from anywhere in the world.",
          "If you didn't create this account, please reply to this email.",
        ],
        details: [["Account email", d.email]],
      }),
    };
  },
  [EmailTemplate.FORGOT_PASSWORD]: (data) => {
    const d = escaped(data);
    return {
      subject: "Your password reset code",
      html: renderEmailHtml({
        heading: "Reset your password",
        paragraphs: [
          `Hi ${d.firstName},`,
          `Use this code to reset your password. It expires in ${d.expiresIn}.`,
          "If you didn't ask to reset your password, you can ignore this email.",
        ],
        code: d.otp,
      }),
    };
  },
  [EmailTemplate.PAYMENT_RECEIVED]: (data) => {
    const d = escaped(data);
    return {
      subject: `Payment received: ${data.currency} ${data.amount}`,
      html: renderEmailHtml({
        heading: "Payment received",
        paragraphs: [
          `Hi ${d.firstName},`,
          `We've received your payment of ${d.currency} ${d.amount}. Thank you.`,
        ],
        details: [
          ["Amount", `${d.currency} ${d.amount}`],
          ["Service", d.service_name],
          ["Payment reference", d.reference],
          ["Receipt ID", d.receipt_id],
          ["Request ID", d.booking_ref],
        ],
      }),
    };
  },
};

const isHtmlEmail = (template: EmailTemplate): template is HtmlEmailTemplate =>
  template in htmlEmails;

/** The subject and HTML for an email sent without a template, or null if it uses a template. */
export const renderHtmlEmail = (content: EmailContent) => {
  if (!isHtmlEmail(content.template)) return null;
  const render = htmlEmails[content.template] as (data: unknown) => {
    subject: string;
    html: string;
  };
  return render(content.data);
};
