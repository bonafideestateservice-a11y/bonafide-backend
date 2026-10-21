/**
 * ZeptoMail templates, one per audience of each notification. Each template's
 * key is read from `ZEPTO_TEMPLATE_<TEMPLATE>` (e.g. ZEPTO_TEMPLATE_PAYMENT_RECEIVED_ADMIN),
 * falling back to the keys below. USER_REGISTERED, FORGOT_PASSWORD and PAYMENT_RECEIVED are sent as
 * HTML (html-emails.ts) and have no template.
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
  PAYMENT_FAILED = "PAYMENT_FAILED",
  SUBSCRIPTION_ENDED = "SUBSCRIPTION_ENDED",
  PROPERTY_REQUEST_CREATED = "PROPERTY_REQUEST_CREATED",
  PROPERTY_REQUEST_CREATED_ADMIN = "PROPERTY_REQUEST_CREATED_ADMIN",
  PROPERTY_REQUEST_UPDATED = "PROPERTY_REQUEST_UPDATED",
  PROPERTY_PAYMENT_RECEIVED = "PROPERTY_PAYMENT_RECEIVED",
  PROPERTY_PAYMENT_RECEIVED_ADMIN = "PROPERTY_PAYMENT_RECEIVED_ADMIN",
  PROPERTY_PAYMENT_FAILED = "PROPERTY_PAYMENT_FAILED",
  AGENT_WELCOME = "AGENT_WELCOME",
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

/** Fields shared by every property purchase or consultation email. */
export interface PropertyRequestMergeInfo {
  firstName: string;
  /** "purchase" or "consultation". */
  requestType: string;
  /** e.g. "BF-PUR-203948". */
  reference: string;
  propertyName: string;
  propertyAddress: string;
}

/** Fields shared by every property payment email. */
export interface PropertyPaymentMergeInfo {
  firstName: string;
  propertyName: string;
  /** The purchase reference, e.g. "BF-PUR-203948". */
  reference: string;
  /** e.g. "BF-PAY-203948". */
  paymentReference: string;
  /** Major units, e.g. "85,000,000.00". */
  amount: string;
  currency: string;
  /** "Card" or "Bank transfer". */
  method: string;
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
  [EmailTemplate.PAYMENT_FAILED]: VerificationRequestMergeInfo & {
    /** Major units of the payment that failed; "" if unknown. */
    amount: string;
    currency: string;
    /** "first payment" or "renewal". */
    paymentKind: string;
  };
  [EmailTemplate.SUBSCRIPTION_ENDED]: VerificationRequestMergeInfo & {
    /** e.g. "Monthly Update". */
    planName: string;
  };
  [EmailTemplate.PROPERTY_REQUEST_CREATED]: PropertyRequestMergeInfo & {
    /** The listed price in major units, e.g. "85,000,000.00". */
    price: string;
    currency: string;
    submittedAt: string;
  };
  [EmailTemplate.PROPERTY_REQUEST_CREATED_ADMIN]: PropertyRequestMergeInfo &
    ClientMergeInfo & { price: string; currency: string; submittedAt: string };
  [EmailTemplate.PROPERTY_REQUEST_UPDATED]: PropertyRequestMergeInfo & {
    /** e.g. "OWNERSHIP_TRANSFER". */
    status: string;
    /** e.g. "Ownership transfer". */
    statusLabel: string;
    message: string;
  };
  [EmailTemplate.PROPERTY_PAYMENT_RECEIVED]: PropertyPaymentMergeInfo & { paidAt: string };
  [EmailTemplate.PROPERTY_PAYMENT_RECEIVED_ADMIN]: PropertyPaymentMergeInfo &
    Pick<ClientMergeInfo, "clientName" | "clientEmail"> & { paidAt: string };
  [EmailTemplate.PROPERTY_PAYMENT_FAILED]: PropertyPaymentMergeInfo;
  [EmailTemplate.AGENT_WELCOME]: {
    firstName: string;
    email: string;
    /** One-time code to set a password at POST /admin/reset-password. */
    setupCode: string;
    expiresIn: string;
    /** The admin/agent app's login page, from ADMIN_APP_URL; "" when not set. */
    loginUrl: string;
  };
}

/** A template paired with its merge data, safe to serialize into a queue job. */
export type EmailContent = {
  [K in EmailTemplate]: { template: K; data: EmailTemplateData[K] };
}[EmailTemplate];

const existingTemplateKeys: Partial<Record<EmailTemplate, string>> = {
  [EmailTemplate.PAYMENT_RECEIVED_ADMIN]:
    "2d6f.1dce9259dff2e5d0.k1.ca360e80-cd64-11f1-a620-5254009dfd0a.1a15f18bf68",
  [EmailTemplate.VERIFICATION_REQUEST_CREATED]:
    "2d6f.1dce9259dff2e5d0.k1.b9ad7cc2-cd6d-11f1-a620-5254009dfd0a.1a15f534e8a",
  [EmailTemplate.VERIFICATION_REQUEST_CREATED_ADMIN]:
    "2d6f.1dce9259dff2e5d0.k1.ce2d2330-cd6d-11f1-a620-5254009dfd0a.1a15f53d4e3",
  [EmailTemplate.REPORT_UPLOADED]:
    "2d6f.1dce9259dff2e5d0.k1.94f744e0-cd65-11f1-a620-5254009dfd0a.1a15f1df02e",
  [EmailTemplate.REPORT_UPLOADED_ADMIN]:
    "2d6f.1dce9259dff2e5d0.k1.6b0c17c0-cd6d-11f1-a620-5254009dfd0a.1a15f514b3c",
  [EmailTemplate.AGENT_ASSIGNED]:
    "2d6f.1dce9259dff2e5d0.k1.47e80e11-cd64-11f1-a620-5254009dfd0a.1a15f15696f",
  [EmailTemplate.AGENT_ASSIGNED_AGENT]:
    "2d6f.1dce9259dff2e5d0.k1.5c8611f1-cd64-11f1-a620-5254009dfd0a.1a15f15f08d",
  [EmailTemplate.INSPECTION_STARTED]:
    "2d6f.1dce9259dff2e5d0.k1.94409481-cd64-11f1-a620-5254009dfd0a.1a15f175dc3",
  [EmailTemplate.INSPECTION_STARTED_ADMIN]:
    "2d6f.1dce9259dff2e5d0.k1.a4c6c630-cd64-11f1-a620-5254009dfd0a.1a15f17ca13",
  [EmailTemplate.PAYMENT_FAILED]:
    "2d6f.1dce9259dff2e5d0.k1.b6726511-cd64-11f1-a620-5254009dfd0a.1a15f183ddf",
  [EmailTemplate.SUBSCRIPTION_ENDED]:
    "2d6f.1dce9259dff2e5d0.k1.7e10b6f0-cd6d-11f1-a620-5254009dfd0a.1a15f51c7df",
  [EmailTemplate.PROPERTY_REQUEST_CREATED]:
    "2d6f.1dce9259dff2e5d0.k1.54b19070-cd65-11f1-a620-5254009dfd0a.1a15f1c4af7",
  [EmailTemplate.PROPERTY_REQUEST_CREATED_ADMIN]:
    "2d6f.1dce9259dff2e5d0.k1.69806850-cd65-11f1-a620-5254009dfd0a.1a15f1cd355",
  [EmailTemplate.PROPERTY_REQUEST_UPDATED]:
    "2d6f.1dce9259dff2e5d0.k1.8181bb70-cd65-11f1-a620-5254009dfd0a.1a15f1d70a7",
  [EmailTemplate.PROPERTY_PAYMENT_RECEIVED]:
    "2d6f.1dce9259dff2e5d0.k1.143effa0-cd65-11f1-a620-5254009dfd0a.1a15f1aa49a",
  [EmailTemplate.PROPERTY_PAYMENT_RECEIVED_ADMIN]:
    "2d6f.1dce9259dff2e5d0.k1.3a8212b0-cd65-11f1-a620-5254009dfd0a.1a15f1b9f5b",
  [EmailTemplate.PROPERTY_PAYMENT_FAILED]:
    "2d6f.1dce9259dff2e5d0.k1.e0834901-cd64-11f1-a620-5254009dfd0a.1a15f19518c",
  [EmailTemplate.AGENT_WELCOME]:
    "2d6f.1dce9259dff2e5d0.k1.7c0bae41-cd64-11f1-a620-5254009dfd0a.1a15f16bf22",
};

export const getEmailTemplateKey = (template: EmailTemplate): string | undefined =>
  process.env[`ZEPTO_TEMPLATE_${template}`] || existingTemplateKeys[template];
