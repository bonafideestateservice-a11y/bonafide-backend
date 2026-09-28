import { SendMailClient } from "zeptomail";
import { AppEventTypes } from "../../events";
import { logger } from "../../utils/logger";

export type MergeInfoBuilder = (payload: any) => Record<string, any>;

export type EmailTemplateConfig = {
  templateKey: string;
  buildMergeInfo: MergeInfoBuilder;
};

export const appEventTypeToEmailConfig: Partial<Record<AppEventTypes, EmailTemplateConfig>> = {
  [AppEventTypes.USER_REGISTERED]: {
    templateKey: "2d6f.f2423e0ada5619d.k1.8ab2e850-00b4-11f1-b387-963d1902c9da.19c21a67b55",
    buildMergeInfo: (payload) => ({
      firstName: payload.firstName,
    }),
  },
  [AppEventTypes.PAYMENT_RECEIVED]: {
    templateKey: "2d6f.f2423e0ada5619d.k1.254eb990-0086-11f1-b387-963d1902c9da.19c20766ba9",
    buildMergeInfo: (payload) => ({
      firstName: payload.firstName,
      amount: payload.amount,
      payment_receipt: payload.payment_receipt,
      booking_ref: payload.booking_ref,
      receipt_id: payload.receipt_id,
      currency: payload.currency,
      service_time: payload.service_time,
      trip_type: payload.trip_type,
      service_name: payload.service_name,
      service_date: payload.service_date,
      airport: payload.airport,
    }),
  },
  [AppEventTypes.FORGOT_PASSWORD]: {
    templateKey: "2d6f.f2423e0ada5619d.k1.fee94bc1-01d5-11f1-b1c4-525400114fe6.19c290f7279",
    buildMergeInfo: (payload) => ({
      firstName: payload.firstName,
      resetLink: payload.resetLink,
      otp: payload.otp,
      expiresIn: payload.expiresIn,
    }),
  },
  [AppEventTypes.VERIFICATION_REQUEST_CREATED]: {
    templateKey: "REPLACE_WITH_VERIFICATION_REQUEST_CREATED_TEMPLATE_KEY",
    buildMergeInfo: (payload) => ({
      firstName: payload.firstName,
      verificationRequestId: payload.verificationRequestId,
      verificationType: payload.verificationType,
    }),
  },
  [AppEventTypes.REPORT_UPLOADED]: {
    templateKey: "REPLACE_WITH_REPORT_UPLOADED_TEMPLATE_KEY",
    buildMergeInfo: (payload) => ({
      firstName: payload.firstName,
      reportId: payload.reportId,
      verificationRequestId: payload.verificationRequestId,
    }),
  },
  [AppEventTypes.AGENT_ASSIGNED]: {
    templateKey: "REPLACE_WITH_AGENT_ASSIGNED_TEMPLATE_KEY",
    buildMergeInfo: (payload) => ({
      firstName: payload.firstName,
      assignmentId: payload.assignmentId,
      verificationRequestId: payload.verificationRequestId,
      agentId: payload.agentId,
    }),
  },
  [AppEventTypes.INSPECTION_STARTED]: {
    templateKey: "REPLACE_WITH_INSPECTION_STARTED_TEMPLATE_KEY",
    buildMergeInfo: (payload) => ({
      firstName: payload.firstName,
      assignmentId: payload.assignmentId,
      verificationRequestId: payload.verificationRequestId,
      agentId: payload.agentId,
    }),
  },
};

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

export async function sendPasswordResetMail({
  email,
  name,
  otp,
}: {
  email: string;
  name: string;
  otp: string;
}) {
  const template = appEventTypeToEmailConfig[AppEventTypes.FORGOT_PASSWORD];

  if (!template) {
    throw new Error("Forgot-password email template is not configured");
  }

  await clientSendMailWithTemplate({
    mail_template_key: template.templateKey,
    email_address: email,
    name,
    merge_info: template.buildMergeInfo({
      firstName: name,
      resetLink: otp,
    }),
  });

  logger.info("Password reset email sent successfully", { to: email });
}
