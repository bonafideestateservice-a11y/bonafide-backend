import { NotificationType, Prisma } from "@prisma/client";
import { AppEventPayloads, AppEventTypes, PayloadEventType } from "../../events";
import {
  getAdminNotificationRecipients,
  getNotificationRecipient,
  getVerificationRequestNotificationContext,
  VerificationRequestNotificationContext,
} from "../../api/services/database/notifications";
import {
  ClientMergeInfo,
  EmailContent,
  EmailTemplate,
  VerificationRequestMergeInfo,
} from "../../libs/zeptomail/templates";
import { formatDate } from "../../utils/date";
import { logger } from "../../utils/logger";
import { DeliveryRecipient, NotificationDelivery, NotificationRecord } from "./types";

type EventHandler<K extends PayloadEventType> = (
  payload: AppEventPayloads[K],
) => Promise<NotificationDelivery[]>;

const toRecipient = ({ id, email, fullName }: DeliveryRecipient): DeliveryRecipient => ({
  id,
  email,
  fullName,
});

const emailAndInApp = (
  recipient: DeliveryRecipient,
  notification: NotificationRecord,
  email: EmailContent,
): NotificationDelivery[] => [
  { channel: "email", recipient: toRecipient(recipient), notification, email },
  { channel: "in_app", recipient: toRecipient(recipient), notification },
];

/** Payment amounts are stored in minor units (kobo/cents). */
const formatAmount = (amountInMinorUnits: number) =>
  (amountInMinorUnits / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const text = (value: unknown): string => (typeof value === "string" ? value : "");

const detailsOf = (details: Prisma.JsonValue): Record<string, unknown> =>
  details && typeof details === "object" && !Array.isArray(details) ? details : {};

const requestMergeInfo = (
  context: VerificationRequestNotificationContext,
  recipient: DeliveryRecipient,
): VerificationRequestMergeInfo => {
  const details = detailsOf(context.details);
  return {
    firstName: recipient.fullName,
    verificationRequestId: context.id,
    verificationType: context.verificationType.name,
    serviceName: context.verificationType.service?.name ?? "",
    requestName: text(details.propertyName) || text(details.businessName),
    address:
      text(details.propertyAddress) ||
      text(details.constructionAddress) ||
      text(details.businessAddress),
  };
};

const clientMergeInfo = (context: VerificationRequestNotificationContext): ClientMergeInfo => ({
  clientName: context.user.fullName,
  clientEmail: context.user.email,
  clientPhone: context.user.phone ?? "",
});

const requestRecord = (
  context: VerificationRequestNotificationContext,
  type: NotificationType,
) => ({
  type,
  verificationRequestId: context.id,
  verificationTypeId: context.verificationTypeId,
  serviceId: context.verificationType.serviceId,
});

const loadContext = async (eventType: AppEventTypes, verificationRequestId: string) => {
  const context = await getVerificationRequestNotificationContext(verificationRequestId);
  if (!context) {
    logger.warn(`[notifications] ${eventType} skipped: verification request not found`, {
      verificationRequestId,
    });
  }
  return context;
};

const handleUserRegistered: EventHandler<AppEventTypes.USER_REGISTERED> = async (payload) => [
  {
    channel: "email",
    recipient: { id: payload.userId, email: payload.email, fullName: payload.firstName },
    email: {
      template: EmailTemplate.USER_REGISTERED,
      data: { firstName: payload.firstName, email: payload.email },
    },
  },
];

const handleForgotPassword: EventHandler<AppEventTypes.FORGOT_PASSWORD> = async (payload) => {
  const user = await getNotificationRecipient(payload.userId);
  const firstName = user?.fullName || payload.email.split("@")[0];

  return [
    {
      channel: "email",
      recipient: { id: payload.userId, email: payload.email, fullName: firstName },
      email: {
        template: EmailTemplate.FORGOT_PASSWORD,
        data: {
          firstName,
          otp: payload.otp,
          resetLink: payload.otp,
          expiresIn: payload.expiresIn,
        },
      },
    },
  ];
};

const handlePaymentReceived: EventHandler<AppEventTypes.PAYMENT_RECEIVED> = async (payload) => {
  const payer: DeliveryRecipient = {
    id: payload.userId,
    email: payload.email,
    fullName: payload.firstName,
  };
  const admins = await getAdminNotificationRecipients([payer.id]);
  const amount = formatAmount(payload.amount);
  const payment = {
    amount,
    currency: payload.currency,
    reference: payload.reference,
    payment_receipt: payload.payment_receipt,
    receipt_id: payload.receipt_id,
    booking_ref: payload.booking_ref,
    service_name: payload.service_name ?? "",
  };
  const record = {
    type: NotificationType.PAYMENT_RECEIVED,
    title: "Payment received",
    verificationRequestId: payload.booking_ref,
    meta: { reference: payload.reference, receiptId: payload.receipt_id },
  };

  return [
    ...emailAndInApp(
      payer,
      { ...record, body: `Your payment of ${payload.currency} ${amount} was received.` },
      {
        template: EmailTemplate.PAYMENT_RECEIVED,
        data: { firstName: payer.fullName, ...payment },
      },
    ),
    ...admins.flatMap((admin) =>
      emailAndInApp(
        admin,
        {
          ...record,
          body: `${payer.fullName} paid ${payload.currency} ${amount}.`,
          meta: { ...record.meta, clientId: payer.id, clientName: payer.fullName },
        },
        {
          template: EmailTemplate.PAYMENT_RECEIVED_ADMIN,
          data: {
            firstName: admin.fullName,
            ...payment,
            clientName: payer.fullName,
            clientEmail: payer.email,
          },
        },
      ),
    ),
  ];
};

const handleVerificationRequestCreated: EventHandler<
  AppEventTypes.VERIFICATION_REQUEST_CREATED
> = async (payload) => {
  const context = await loadContext(
    AppEventTypes.VERIFICATION_REQUEST_CREATED,
    payload.verificationRequestId,
  );
  if (!context) return [];

  const admins = await getAdminNotificationRecipients([context.user.id]);
  const base = requestRecord(context, NotificationType.VERIFICATION_REQUEST_CREATED);
  const meta = { verificationRequestId: context.id, clientName: context.user.fullName };
  const submittedAt = formatDate(context.createdAt);

  return [
    ...emailAndInApp(
      context.user,
      {
        ...base,
        title: "Verification request created",
        body: `Your ${context.verificationType.name} verification request was created.`,
        meta,
      },
      {
        template: EmailTemplate.VERIFICATION_REQUEST_CREATED,
        data: { ...requestMergeInfo(context, context.user), submittedAt },
      },
    ),
    ...admins.flatMap((admin) =>
      emailAndInApp(
        admin,
        {
          ...base,
          title: "New verification request",
          body: `${context.user.fullName} submitted a ${context.verificationType.name} verification request.`,
          meta: { ...meta, clientId: context.user.id },
        },
        {
          template: EmailTemplate.VERIFICATION_REQUEST_CREATED_ADMIN,
          data: {
            ...requestMergeInfo(context, admin),
            ...clientMergeInfo(context),
            submittedAt,
          },
        },
      ),
    ),
  ];
};

const handleReportUploaded: EventHandler<AppEventTypes.REPORT_UPLOADED> = async (payload) => {
  const context = await loadContext(AppEventTypes.REPORT_UPLOADED, payload.verificationRequestId);
  if (!context) return [];

  const admins = await getAdminNotificationRecipients([context.user.id]);
  const base = requestRecord(context, NotificationType.REPORT_UPLOADED);
  const agentName = context.agentAssignment?.agent.name ?? "";
  const meta = { reportId: payload.reportId, agentName };

  return [
    // Clients can opt out of report emails per request.
    ...(context.notifyOnReportReady
      ? emailAndInApp(
          context.user,
          {
            ...base,
            title: "Verification report uploaded",
            body: `A report is available for your ${context.verificationType.name} verification.`,
            meta,
          },
          {
            template: EmailTemplate.REPORT_UPLOADED,
            data: {
              ...requestMergeInfo(context, context.user),
              reportId: payload.reportId,
              agentName,
            },
          },
        )
      : []),
    ...admins.flatMap((admin) =>
      emailAndInApp(
        admin,
        {
          ...base,
          title: "Verification report uploaded",
          body: `A report was uploaded for ${context.user.fullName}'s ${context.verificationType.name} verification.`,
          meta: { ...meta, clientId: context.user.id, clientName: context.user.fullName },
        },
        {
          template: EmailTemplate.REPORT_UPLOADED_ADMIN,
          data: {
            ...requestMergeInfo(context, admin),
            ...clientMergeInfo(context),
            reportId: payload.reportId,
            agentName,
          },
        },
      ),
    ),
  ];
};

const handleAgentAssigned: EventHandler<AppEventTypes.AGENT_ASSIGNED> = async (payload) => {
  const context = await loadContext(AppEventTypes.AGENT_ASSIGNED, payload.verificationRequestId);
  if (!context) return [];

  const agent = context.agentAssignment?.agent;
  const base = requestRecord(context, NotificationType.AGENT_ASSIGNED);
  const meta = {
    assignmentId: payload.assignmentId,
    agentId: payload.agentId,
    agentName: agent?.name ?? "",
  };

  return [
    ...emailAndInApp(
      context.user,
      {
        ...base,
        title: "Agent assigned",
        body: `An agent has been assigned to your ${context.verificationType.name} verification.`,
        meta,
      },
      {
        template: EmailTemplate.AGENT_ASSIGNED,
        data: {
          ...requestMergeInfo(context, context.user),
          agentName: agent?.name ?? "",
          agentPhone: agent?.phone ?? "",
        },
      },
    ),
    ...(agent && agent.user.id !== context.user.id
      ? emailAndInApp(
          agent.user,
          {
            ...base,
            title: "New assignment",
            body: `You have been assigned to ${context.user.fullName}'s ${context.verificationType.name} verification.`,
            meta: { ...meta, clientName: context.user.fullName },
          },
          {
            template: EmailTemplate.AGENT_ASSIGNED_AGENT,
            data: {
              ...requestMergeInfo(context, agent.user),
              ...clientMergeInfo(context),
              assignmentId: payload.assignmentId,
            },
          },
        )
      : []),
  ];
};

const handleInspectionStarted: EventHandler<AppEventTypes.INSPECTION_STARTED> = async (payload) => {
  const context = await loadContext(
    AppEventTypes.INSPECTION_STARTED,
    payload.verificationRequestId,
  );
  if (!context) return [];

  const admins = await getAdminNotificationRecipients([context.user.id]);
  const base = requestRecord(context, NotificationType.INSPECTION_STARTED);
  const agentName = context.agentAssignment?.agent.name ?? "";
  const meta = { assignmentId: payload.assignmentId, agentId: payload.agentId };

  return [
    // Clients can opt out of inspection-start emails per request.
    ...(context.notifyOnInspectionStart
      ? emailAndInApp(
          context.user,
          {
            ...base,
            title: "Inspection started",
            body: `Inspection has started for your ${context.verificationType.name} verification.`,
            meta,
          },
          {
            template: EmailTemplate.INSPECTION_STARTED,
            data: { ...requestMergeInfo(context, context.user), agentName },
          },
        )
      : []),
    ...admins.flatMap((admin) =>
      emailAndInApp(
        admin,
        {
          ...base,
          title: "Inspection started",
          body: `Inspection has started for ${context.user.fullName}'s ${context.verificationType.name} verification.`,
          meta: { ...meta, clientId: context.user.id, clientName: context.user.fullName },
        },
        {
          template: EmailTemplate.INSPECTION_STARTED_ADMIN,
          data: {
            ...requestMergeInfo(context, admin),
            ...clientMergeInfo(context),
            assignmentId: payload.assignmentId,
            agentName,
          },
        },
      ),
    ),
  ];
};

export const notificationEventHandlers: { [K in PayloadEventType]: EventHandler<K> } = {
  [AppEventTypes.USER_REGISTERED]: handleUserRegistered,
  [AppEventTypes.FORGOT_PASSWORD]: handleForgotPassword,
  [AppEventTypes.PAYMENT_RECEIVED]: handlePaymentReceived,
  [AppEventTypes.VERIFICATION_REQUEST_CREATED]: handleVerificationRequestCreated,
  [AppEventTypes.REPORT_UPLOADED]: handleReportUploaded,
  [AppEventTypes.AGENT_ASSIGNED]: handleAgentAssigned,
  [AppEventTypes.INSPECTION_STARTED]: handleInspectionStarted,
};
