/**
 * ZeptoMail templates, one per audience of each notification. Each template's
 * key is read from `ZEPTO_TEMPLATE_<TEMPLATE>` (e.g. ZEPTO_TEMPLATE_PAYMENT_RECEIVED_ADMIN),
 * falling back to the keys of templates that already exist in ZeptoMail.
 *
 * The data types below are the merge fields each template receives. Every value
 * is a string, and optional fields are sent as "" when the data is missing.
 */
export enum EmailTemplate {
  USER_REGISTERED = "USER_REGISTERED",
  FORGOT_PASSWORD = "FORGOT_PASSWORD",
  PAYMENT_RECEIVED = "PAYMENT_RECEIVED",
  PAYMENT_RECEIVED_ADMIN = "PAYMENT_RECEIVED_ADMIN",
  VERIFICATION_REQUEST_CREATED = "VERIFICATION_REQUEST_CREATED",
  VERIFICATION_REQUEST_CREATED_ADMIN = "VERIFICATION_REQUEST_CREATED_ADMIN",
  REPORT_UPLOADED = "REPORT_UPLOADED",
  REPORT_UPLOADED_ADMIN = "REPORT_UPLOADED_ADMIN",
  AGENT_ASSIGNED = "AGENT_ASSIGNED",
  AGENT_ASSIGNED_AGENT = "AGENT_ASSIGNED_AGENT",
  INSPECTION_STARTED = "INSPECTION_STARTED",
  INSPECTION_STARTED_ADMIN = "INSPECTION_STARTED_ADMIN",
}

/** Fields shared by every verification request email. */
export interface VerificationRequestMergeInfo {
  firstName: string;
  verificationRequestId: string;
  verificationType: string;
  serviceName: string;
  /** Property or business name from the request details. */
  requestName: string;
  /** Property, construction or business address from the request details. */
  address: string;
}

/** Client fields added to emails sent to admins and agents. */
export interface ClientMergeInfo {
  clientName: string;
  clientEmail: string;
  clientPhone: string;
}

export interface PaymentMergeInfo {
  firstName: string;
  /** Major units, e.g. "1,500.00". */
  amount: string;
  currency: string;
  reference: string;
  payment_receipt: string;
  receipt_id: string;
  booking_ref: string;
  service_name: string;
}

export interface EmailTemplateData {
  [EmailTemplate.USER_REGISTERED]: { firstName: string; email: string };
  [EmailTemplate.FORGOT_PASSWORD]: {
    firstName: string;
    otp: string;
    /** Same value as `otp`; kept for the existing template. */
    resetLink: string;
    expiresIn: string;
  };
  [EmailTemplate.PAYMENT_RECEIVED]: PaymentMergeInfo;
  [EmailTemplate.PAYMENT_RECEIVED_ADMIN]: PaymentMergeInfo &
    Pick<ClientMergeInfo, "clientName" | "clientEmail">;
  [EmailTemplate.VERIFICATION_REQUEST_CREATED]: VerificationRequestMergeInfo & {
    submittedAt: string;
  };
  [EmailTemplate.VERIFICATION_REQUEST_CREATED_ADMIN]: VerificationRequestMergeInfo &
    ClientMergeInfo & { submittedAt: string };
  [EmailTemplate.REPORT_UPLOADED]: VerificationRequestMergeInfo & {
    reportId: string;
    agentName: string;
  };
  [EmailTemplate.REPORT_UPLOADED_ADMIN]: VerificationRequestMergeInfo &
    ClientMergeInfo & { reportId: string; agentName: string };
  [EmailTemplate.AGENT_ASSIGNED]: VerificationRequestMergeInfo & {
    agentName: string;
    agentPhone: string;
  };
  [EmailTemplate.AGENT_ASSIGNED_AGENT]: VerificationRequestMergeInfo &
    ClientMergeInfo & { assignmentId: string };
  [EmailTemplate.INSPECTION_STARTED]: VerificationRequestMergeInfo & {
    agentName: string;
  };
  [EmailTemplate.INSPECTION_STARTED_ADMIN]: VerificationRequestMergeInfo &
    ClientMergeInfo & { assignmentId: string; agentName: string };
}

/** A template paired with its merge data, safe to serialize into a queue job. */
export type EmailContent = {
  [K in EmailTemplate]: { template: K; data: EmailTemplateData[K] };
}[EmailTemplate];

const existingTemplateKeys: Partial<Record<EmailTemplate, string>> = {
  [EmailTemplate.USER_REGISTERED]:
    "2d6f.f2423e0ada5619d.k1.8ab2e850-00b4-11f1-b387-963d1902c9da.19c21a67b55",
  [EmailTemplate.PAYMENT_RECEIVED]:
    "2d6f.f2423e0ada5619d.k1.254eb990-0086-11f1-b387-963d1902c9da.19c20766ba9",
  [EmailTemplate.FORGOT_PASSWORD]:
    "2d6f.f2423e0ada5619d.k1.fee94bc1-01d5-11f1-b1c4-525400114fe6.19c290f7279",
};

export const getEmailTemplateKey = (template: EmailTemplate): string | undefined =>
  process.env[`ZEPTO_TEMPLATE_${template}`] || existingTemplateKeys[template];
