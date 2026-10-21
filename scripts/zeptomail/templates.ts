import { EmailTemplate, EmailTemplateData } from "../../src/libs/zeptomail/templates";

/**
 * HTML for the ZeptoMail templates that don't exist yet. `{{field}}` placeholders are the merge
 * fields the backend sends (see src/libs/zeptomail/email-templates.md). `sample` is the data a
 * test send uses.
 */
export interface TemplateDefinition<K extends EmailTemplate = EmailTemplate> {
  template: K;
  subject: string;
  heading: string;
  paragraphs: string[];
  /** Label/value rows shown in a details box. */
  details?: [string, string][];
  sample: EmailTemplateData[K];
}

const BRAND = "#0F3D3E";

const row = ([label, value]: [string, string]) => `
            <tr>
              <td style="padding:6px 0;color:#6b7280;font-size:14px;width:40%;vertical-align:top">${label}</td>
              <td style="padding:6px 0;color:#111827;font-size:14px;font-weight:600">${value}</td>
            </tr>`;

export const renderHtml = ({ heading, paragraphs, details }: TemplateDefinition) => `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;overflow:hidden">
            <tr>
              <td style="background:${BRAND};padding:20px 28px;color:#ffffff;font-size:20px;font-weight:700">Bonafide</td>
            </tr>
            <tr>
              <td style="padding:28px">
                <h1 style="margin:0 0 16px;font-size:20px;color:#111827">${heading}</h1>
${paragraphs.map((p) => `                <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#374151">${p}</p>`).join("\n")}${
  details
    ? `
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 18px;padding:14px 16px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px">${details.map(row).join("")}
                </table>`
    : ""
}
                <p style="margin:18px 0 0;font-size:15px;color:#374151">The Bonafide team</p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px;background:#f9fafb;color:#9ca3af;font-size:12px;line-height:1.5">
                You're receiving this email because you have a Bonafide account.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;

const request = {
  verificationRequestId: "cmg4x2k1p0001qz8h3f7a9b2c",
  verificationType: "Land Verification",
  serviceName: "Property",
  requestName: "Palm Villa",
  address: "12 Allen Avenue, Ikeja, Lagos",
};
const client = {
  clientName: "Ada Okafor",
  clientEmail: "ada@example.com",
  clientPhone: "+2348012345678",
};
const requestRows: [string, string][] = [
  ["Verification", "{{verificationType}}"],
  ["Property", "{{requestName}}"],
  ["Address", "{{address}}"],
  ["Request ID", "{{verificationRequestId}}"],
];
const clientRows: [string, string][] = [
  ["Client", "{{clientName}}"],
  ["Email", "{{clientEmail}}"],
  ["Phone", "{{clientPhone}}"],
];
const purchase = {
  requestType: "purchase",
  reference: "BF-PUR-203948",
  propertyName: "Palm Villa",
  propertyAddress: "12 Allen Avenue, Ikeja, Lagos",
};
const purchaseRows: [string, string][] = [
  ["Property", "{{propertyName}}"],
  ["Address", "{{propertyAddress}}"],
  ["Reference", "{{reference}}"],
];
const payment = {
  propertyName: "Palm Villa",
  reference: "BF-PUR-203948",
  paymentReference: "BF-PAY-203948",
  amount: "85,000,000.00",
  currency: "NGN",
  method: "Card",
};
const paymentRows: [string, string][] = [
  ["Property", "{{propertyName}}"],
  ["Amount", "{{currency}} {{amount}}"],
  ["Method", "{{method}}"],
  ["Payment reference", "{{paymentReference}}"],
  ["Purchase reference", "{{reference}}"],
];
const submittedAt = "2026-09-30T10:00:00.000Z";

const define = <K extends EmailTemplate>(definition: TemplateDefinition<K>) => definition;

export const templateDefinitions: TemplateDefinition[] = [
  define({
    template: EmailTemplate.PAYMENT_RECEIVED_ADMIN,
    subject: "{{clientName}} paid {{currency}} {{amount}}",
    heading: "New payment received",
    paragraphs: ["Hi {{firstName}},", "{{clientName}} ({{clientEmail}}) has made a payment."],
    details: [
      ["Amount", "{{currency}} {{amount}}"],
      ["Service", "{{service_name}}"],
      ["Payment reference", "{{reference}}"],
      ["Receipt ID", "{{receipt_id}}"],
      ["Request ID", "{{booking_ref}}"],
    ],
    sample: {
      firstName: "Chidi Eze",
      clientName: "Ada Okafor",
      clientEmail: "ada@example.com",
      amount: "1,500.00",
      currency: "NGN",
      reference: "T482913650284",
      payment_receipt: "T482913650284",
      receipt_id: "cmg4x9q2r0003qz8hk1d7e4f5",
      booking_ref: "cmg4x2k1p0001qz8h3f7a9b2c",
      service_name: "Land Verification",
    },
  }),
  define({
    template: EmailTemplate.VERIFICATION_REQUEST_CREATED,
    subject: "We've received your {{verificationType}} request",
    heading: "Request received",
    paragraphs: [
      "Hi {{firstName}},",
      "Thanks for your {{verificationType}} request. We'll assign an agent and keep you updated at every step.",
    ],
    details: [...requestRows, ["Submitted", "{{submittedAt}}"]],
    sample: { firstName: "Ada Okafor", ...request, submittedAt },
  }),
  define({
    template: EmailTemplate.VERIFICATION_REQUEST_CREATED_ADMIN,
    subject: "New {{verificationType}} request from {{clientName}}",
    heading: "New verification request",
    paragraphs: [
      "Hi {{firstName}},",
      "{{clientName}} has submitted a {{verificationType}} request.",
    ],
    details: [...clientRows, ...requestRows, ["Submitted", "{{submittedAt}}"]],
    sample: { firstName: "Chidi Eze", ...client, ...request, submittedAt },
  }),
  define({
    template: EmailTemplate.AGENT_ASSIGNED,
    subject: "An agent has been assigned to your {{verificationType}}",
    heading: "Your agent has been assigned",
    paragraphs: [
      "Hi {{firstName}},",
      "{{agentName}} will handle your {{verificationType}}. They'll be in touch to arrange the inspection.",
    ],
    details: [["Agent", "{{agentName}}"], ["Agent phone", "{{agentPhone}}"], ...requestRows],
    sample: {
      firstName: "Ada Okafor",
      ...request,
      agentName: "Tunde Bello",
      agentPhone: "+2348098765432",
    },
  }),
  define({
    template: EmailTemplate.AGENT_ASSIGNED_AGENT,
    subject: "New assignment: {{verificationType}} for {{clientName}}",
    heading: "You have a new assignment",
    paragraphs: [
      "Hi {{firstName}},",
      "You've been assigned a {{verificationType}}. Log in to accept it and schedule the inspection.",
    ],
    details: [...clientRows, ...requestRows, ["Assignment ID", "{{assignmentId}}"]],
    sample: {
      firstName: "Tunde Bello",
      ...client,
      ...request,
      assignmentId: "cmg4z7h8j0005qz8hr2s3t4u5",
    },
  }),
  define({
    template: EmailTemplate.INSPECTION_STARTED,
    subject: "Your {{verificationType}} inspection has started",
    heading: "Inspection started",
    paragraphs: [
      "Hi {{firstName}},",
      "{{agentName}} has started inspecting your property. We'll let you know when the report is ready.",
    ],
    details: [["Agent", "{{agentName}}"], ...requestRows],
    sample: { firstName: "Ada Okafor", ...request, agentName: "Tunde Bello" },
  }),
  define({
    template: EmailTemplate.INSPECTION_STARTED_ADMIN,
    subject: "Inspection started for {{clientName}}'s {{verificationType}}",
    heading: "Inspection started",
    paragraphs: [
      "Hi {{firstName}},",
      "{{agentName}} has started an inspection for {{clientName}}.",
    ],
    details: [
      ["Agent", "{{agentName}}"],
      ...clientRows,
      ...requestRows,
      ["Assignment ID", "{{assignmentId}}"],
    ],
    sample: {
      firstName: "Chidi Eze",
      ...client,
      ...request,
      agentName: "Tunde Bello",
      assignmentId: "cmg4z7h8j0005qz8hr2s3t4u5",
    },
  }),
  define({
    template: EmailTemplate.REPORT_UPLOADED,
    subject: "Your {{verificationType}} report is ready",
    heading: "Your report is ready",
    paragraphs: [
      "Hi {{firstName}},",
      "The report for your {{verificationType}} is ready. Log in to Bonafide to read it.",
    ],
    details: [["Agent", "{{agentName}}"], ...requestRows, ["Report ID", "{{reportId}}"]],
    sample: {
      firstName: "Ada Okafor",
      ...request,
      agentName: "Tunde Bello",
      reportId: "cmg5a1b2c0007qz8hm3n4p5q6",
    },
  }),
  define({
    template: EmailTemplate.REPORT_UPLOADED_ADMIN,
    subject: "Report uploaded for {{clientName}}'s {{verificationType}}",
    heading: "Report uploaded",
    paragraphs: [
      "Hi {{firstName}},",
      "{{agentName}} has uploaded the {{verificationType}} report for {{clientName}}.",
    ],
    details: [
      ["Agent", "{{agentName}}"],
      ...clientRows,
      ...requestRows,
      ["Report ID", "{{reportId}}"],
    ],
    sample: {
      firstName: "Chidi Eze",
      ...client,
      ...request,
      agentName: "Tunde Bello",
      reportId: "cmg5a1b2c0007qz8hm3n4p5q6",
    },
  }),
  define({
    template: EmailTemplate.PAYMENT_FAILED,
    subject: "Your payment didn't go through",
    heading: "Payment not successful",
    paragraphs: [
      "Hi {{firstName}},",
      "Your {{paymentKind}} of {{currency}} {{amount}} for {{verificationType}} didn't go through.",
      "Please check your card or try another payment method in the Bonafide app.",
    ],
    details: requestRows,
    sample: {
      firstName: "Ada Okafor",
      ...request,
      amount: "1,500.00",
      currency: "NGN",
      paymentKind: "renewal",
    },
  }),
  define({
    template: EmailTemplate.SUBSCRIPTION_ENDED,
    subject: "Your {{planName}} plan has ended",
    heading: "Your plan has ended",
    paragraphs: [
      "Hi {{firstName}},",
      "Your {{planName}} plan for {{verificationType}} has ended. You won't be charged again.",
      "You can start a new plan at any time in the Bonafide app.",
    ],
    details: requestRows,
    sample: { firstName: "Ada Okafor", ...request, planName: "Monthly Update" },
  }),
  define({
    template: EmailTemplate.PROPERTY_REQUEST_CREATED,
    subject: "We've received your {{requestType}} request for {{propertyName}}",
    heading: "Request received",
    paragraphs: [
      "Hi {{firstName}},",
      "Thanks for your {{requestType}} request for {{propertyName}}. Our team will contact you shortly.",
    ],
    details: [
      ...purchaseRows,
      ["Price", "{{currency}} {{price}}"],
      ["Submitted", "{{submittedAt}}"],
    ],
    sample: {
      firstName: "Ada Okafor",
      ...purchase,
      price: "85,000,000.00",
      currency: "NGN",
      submittedAt,
    },
  }),
  define({
    template: EmailTemplate.PROPERTY_REQUEST_CREATED_ADMIN,
    subject: "New {{requestType}} request from {{clientName}}",
    heading: "New property request",
    paragraphs: [
      "Hi {{firstName}},",
      "{{clientName}} has made a {{requestType}} request for {{propertyName}}.",
    ],
    details: [
      ...clientRows,
      ...purchaseRows,
      ["Price", "{{currency}} {{price}}"],
      ["Submitted", "{{submittedAt}}"],
    ],
    sample: {
      firstName: "Chidi Eze",
      ...client,
      ...purchase,
      price: "85,000,000.00",
      currency: "NGN",
      submittedAt,
    },
  }),
  define({
    template: EmailTemplate.PROPERTY_REQUEST_UPDATED,
    subject: "{{propertyName}}: {{statusLabel}}",
    heading: "{{statusLabel}}",
    paragraphs: [
      "Hi {{firstName}},",
      "There's an update on your {{requestType}} request for {{propertyName}}.",
      "{{message}}",
    ],
    details: [...purchaseRows, ["Stage", "{{statusLabel}}"]],
    sample: {
      firstName: "Ada Okafor",
      ...purchase,
      status: "OWNERSHIP_TRANSFER",
      statusLabel: "Ownership transfer",
      message: "Bonafide is handling the ownership transfer. We'll share the documents with you.",
    },
  }),
  define({
    template: EmailTemplate.PROPERTY_PAYMENT_RECEIVED,
    subject: "Payment received for {{propertyName}}",
    heading: "Payment received",
    paragraphs: [
      "Hi {{firstName}},",
      "We've received your payment of {{currency}} {{amount}} for {{propertyName}}. Your purchase remains in progress.",
    ],
    details: [...paymentRows, ["Paid", "{{paidAt}}"]],
    sample: { firstName: "Ada Okafor", ...payment, paidAt: "2026-10-01T09:00:00.000Z" },
  }),
  define({
    template: EmailTemplate.PROPERTY_PAYMENT_RECEIVED_ADMIN,
    subject: "{{clientName}} paid for {{propertyName}}",
    heading: "Property payment received",
    paragraphs: [
      "Hi {{firstName}},",
      "{{clientName}} ({{clientEmail}}) paid {{currency}} {{amount}} for {{propertyName}}.",
    ],
    details: [["Client", "{{clientName}}"], ...paymentRows, ["Paid", "{{paidAt}}"]],
    sample: {
      firstName: "Chidi Eze",
      clientName: "Ada Okafor",
      clientEmail: "ada@example.com",
      ...payment,
      paidAt: "2026-10-01T09:00:00.000Z",
    },
  }),
  define({
    template: EmailTemplate.PROPERTY_PAYMENT_FAILED,
    subject: "Your payment for {{propertyName}} didn't go through",
    heading: "Payment not successful",
    paragraphs: [
      "Hi {{firstName}},",
      "Your payment of {{currency}} {{amount}} for {{propertyName}} didn't go through.",
      "You can retry or choose another payment method in the Bonafide app.",
    ],
    details: paymentRows,
    sample: { firstName: "Ada Okafor", ...payment },
  }),
  define({
    template: EmailTemplate.AGENT_WELCOME,
    subject: "Your Bonafide agent account is ready",
    heading: "Welcome to Bonafide",
    paragraphs: [
      "Hi {{firstName}},",
      "An agent account has been created for you. To get started, set your password with the code below, then log in with {{email}}.",
      "The code expires in {{expiresIn}}. If it expires, use <strong>Forgot password</strong> on the login page to get a new one.",
      'Log in here: <a href="{{loginUrl}}" style="color:#0F3D3E">{{loginUrl}}</a>',
    ],
    details: [
      ["Email", "{{email}}"],
      ["Setup code", "{{setupCode}}"],
    ],
    sample: {
      firstName: "Tunde Bello",
      email: "tunde@example.com",
      setupCode: "482913",
      expiresIn: "48 hours",
      loginUrl: "https://admin.bonafide.com.ng/login",
    },
  }),
];
