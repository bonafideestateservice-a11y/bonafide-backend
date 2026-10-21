import { NotificationType, Prisma } from "@prisma/client";
import { AppEventPayloads, AppEventTypes, PayloadEventType } from "../../events";
import {
  getAdminNotificationRecipients,
  getNotificationRecipient,
  getPropertyPaymentNotificationContext,
  getPropertyRequestNotificationContext,
  getVerificationRequestNotificationContext,
  PropertyRequestNotificationContext,
  VerificationRequestNotificationContext,
} from "../../api/services/database/notifications";
import { STATUS_LABELS } from "../../api/services/database/property-request";
import {
  ClientMergeInfo,
  EmailContent,
  EmailTemplate,
  PropertyRequestMergeInfo,
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

/**
 * A tracked email with no in-app copy: used where the in-app notification is created by the
 * action itself (property requests and payments). It still respects the email setting.
 */
const emailOnly = (
  recipient: DeliveryRecipient,
  notification: NotificationRecord,
  email: EmailContent,
): NotificationDelivery[] => [
  { channel: "email", recipient: toRecipient(recipient), notification, email },
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
  const agentName =
    context.reports.find((report) => report.id === payload.reportId)?.agent.name ??
    context.agentAssignment?.agent.name ??
    "";
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

const handlePaymentFailed: EventHandler<AppEventTypes.PAYMENT_FAILED> = async (payload) => {
  const context = await loadContext(AppEventTypes.PAYMENT_FAILED, payload.verificationRequestId);
  if (!context) return [];

  const failed = context.transactions.find((transaction) => transaction.status === "FAILED");
  const renewal = context.transactions.some((transaction) => transaction.status === "SUCCESS");
  const merge = requestMergeInfo(context, context.user);
  const subject = merge.requestName || `${context.verificationType.name} verification`;

  return emailAndInApp(
    context.user,
    {
      ...requestRecord(context, NotificationType.PAYMENT_FAILED),
      title: "Payment not successful",
      body: renewal
        ? `The renewal payment for ${subject} didn't go through. Update your card to keep it active.`
        : `Your payment for ${subject} didn't go through. You can try again.`,
    },
    {
      template: EmailTemplate.PAYMENT_FAILED,
      data: {
        ...merge,
        amount: failed ? formatAmount(failed.amountInCents) : "",
        currency: failed?.currency ?? "",
        paymentKind: renewal ? "renewal" : "first payment",
      },
    },
  );
};

const handleSubscriptionEnded: EventHandler<AppEventTypes.SUBSCRIPTION_ENDED> = async (payload) => {
  const context = await loadContext(
    AppEventTypes.SUBSCRIPTION_ENDED,
    payload.verificationRequestId,
  );
  if (!context) return [];

  const planName = context.verificationPlan?.name ?? "";
  const merge = requestMergeInfo(context, context.user);
  const subject = merge.requestName || `${context.verificationType.name} verification`;

  return emailAndInApp(
    context.user,
    {
      ...requestRecord(context, NotificationType.SUBSCRIPTION_ENDED),
      title: "Subscription ended",
      body: `Your ${planName || "recurring"} plan for ${subject} has ended. No more renewals will be charged.`,
    },
    { template: EmailTemplate.SUBSCRIPTION_ENDED, data: { ...merge, planName } },
  );
};

const propertyMergeInfo = (
  context: PropertyRequestNotificationContext,
  recipient: DeliveryRecipient,
): PropertyRequestMergeInfo => ({
  firstName: recipient.fullName,
  requestType: context.type.toLowerCase(),
  reference: context.reference,
  propertyName: context.property.name,
  propertyAddress: context.property.address ?? "",
});

const propertyRecord = (
  context: PropertyRequestNotificationContext,
  type: NotificationType,
  title: string,
  body: string,
): NotificationRecord => ({
  type,
  title,
  body,
  meta: { propertyRequestId: context.id, reference: context.reference },
});

const handlePropertyRequestCreated: EventHandler<AppEventTypes.PROPERTY_REQUEST_CREATED> = async (
  payload,
) => {
  const context = await getPropertyRequestNotificationContext(payload.propertyRequestId);
  if (!context) return [];

  const admins = await getAdminNotificationRecipients([context.user.id]);
  const what = context.type === "PURCHASE" ? "purchase" : "consultation";
  const listing = {
    price: formatAmount(Number(context.property.priceAmount) * 100),
    currency: context.property.priceCurrency,
    submittedAt: formatDate(context.createdAt),
  };
  const client = {
    clientName: context.user.fullName,
    clientEmail: context.user.email,
    clientPhone: context.user.phone ?? "",
  };

  return [
    ...emailOnly(
      context.user,
      propertyRecord(
        context,
        NotificationType.PROPERTY_REQUEST_CREATED,
        `We've received your ${what} request`,
        `Your ${what} request for ${context.property.name} was received.`,
      ),
      {
        template: EmailTemplate.PROPERTY_REQUEST_CREATED,
        data: { ...propertyMergeInfo(context, context.user), ...listing },
      },
    ),
    ...admins.flatMap((admin) =>
      emailOnly(
        admin,
        propertyRecord(
          context,
          NotificationType.PROPERTY_REQUEST_CREATED,
          `New ${what} request`,
          `${context.user.fullName} made a ${what} request for ${context.property.name}.`,
        ),
        {
          template: EmailTemplate.PROPERTY_REQUEST_CREATED_ADMIN,
          data: { ...propertyMergeInfo(context, admin), ...client, ...listing },
        },
      ),
    ),
  ];
};

const handlePropertyRequestUpdated: EventHandler<AppEventTypes.PROPERTY_REQUEST_UPDATED> = async (
  payload,
) => {
  const context = await getPropertyRequestNotificationContext(payload.propertyRequestId);
  if (!context) return [];

  const statusLabel = STATUS_LABELS[payload.status as keyof typeof STATUS_LABELS] ?? payload.status;
  return emailOnly(
    context.user,
    propertyRecord(
      context,
      NotificationType.PROPERTY_REQUEST_UPDATED,
      statusLabel,
      payload.message,
    ),
    {
      template: EmailTemplate.PROPERTY_REQUEST_UPDATED,
      data: {
        ...propertyMergeInfo(context, context.user),
        status: payload.status,
        statusLabel,
        message: payload.message,
      },
    },
  );
};

const METHOD_LABELS: Record<string, string> = { CARD: "Card", BANK_TRANSFER: "Bank transfer" };

const loadPropertyPayment = async (propertyPaymentId: string) => {
  const payment = await getPropertyPaymentNotificationContext(propertyPaymentId);
  if (!payment) return null;
  const { request } = payment;
  return {
    payment,
    request,
    merge: (recipient: DeliveryRecipient) => ({
      firstName: recipient.fullName,
      propertyName: request.property.name,
      reference: request.reference,
      paymentReference: payment.reference,
      amount: formatAmount(Number(payment.amountInKobo)),
      currency: payment.currency,
      method: payment.method ? (METHOD_LABELS[payment.method] ?? payment.method) : "",
    }),
  };
};

const handlePropertyPaymentReceived: EventHandler<AppEventTypes.PROPERTY_PAYMENT_RECEIVED> = async (
  payload,
) => {
  const loaded = await loadPropertyPayment(payload.propertyPaymentId);
  if (!loaded) return [];
  const { payment, request, merge } = loaded;

  const admins = await getAdminNotificationRecipients([request.user.id]);
  const paidAt = payment.paidAt ? formatDate(payment.paidAt) : "";
  const amount = `${payment.currency} ${formatAmount(Number(payment.amountInKobo))}`;

  return [
    ...emailOnly(
      request.user,
      propertyRecord(
        request,
        NotificationType.PROPERTY_PAYMENT_RECEIVED,
        "Payment received",
        `Your payment of ${amount} for ${request.property.name} was received.`,
      ),
      {
        template: EmailTemplate.PROPERTY_PAYMENT_RECEIVED,
        data: { ...merge(request.user), paidAt },
      },
    ),
    ...admins.flatMap((admin) =>
      emailOnly(
        admin,
        propertyRecord(
          request,
          NotificationType.PROPERTY_PAYMENT_RECEIVED,
          "Property payment received",
          `${request.user.fullName} paid ${amount} for ${request.property.name}.`,
        ),
        {
          template: EmailTemplate.PROPERTY_PAYMENT_RECEIVED_ADMIN,
          data: {
            ...merge(admin),
            paidAt,
            clientName: request.user.fullName,
            clientEmail: request.user.email,
          },
        },
      ),
    ),
  ];
};

const handlePropertyPaymentFailed: EventHandler<AppEventTypes.PROPERTY_PAYMENT_FAILED> = async (
  payload,
) => {
  const loaded = await loadPropertyPayment(payload.propertyPaymentId);
  if (!loaded) return [];
  const { request, merge } = loaded;

  return emailOnly(
    request.user,
    propertyRecord(
      request,
      NotificationType.PROPERTY_PAYMENT_FAILED,
      "Payment not successful",
      `Your payment for ${request.property.name} was not successful.`,
    ),
    { template: EmailTemplate.PROPERTY_PAYMENT_FAILED, data: merge(request.user) },
  );
};

/** The new agent's welcome email with a one-time code to set a password. Always sent. */
const handleAgentCreated: EventHandler<AppEventTypes.AGENT_CREATED> = async (payload) => [
  {
    channel: "email",
    recipient: { id: payload.userId, email: payload.email, fullName: payload.fullName },
    email: {
      template: EmailTemplate.AGENT_WELCOME,
      data: {
        firstName: payload.fullName,
        email: payload.email,
        setupCode: payload.setupCode,
        expiresIn: payload.expiresIn,
        loginUrl: process.env.ADMIN_APP_URL ?? "",
      },
    },
  },
];

export const notificationEventHandlers: { [K in PayloadEventType]: EventHandler<K> } = {
  [AppEventTypes.USER_REGISTERED]: handleUserRegistered,
  [AppEventTypes.FORGOT_PASSWORD]: handleForgotPassword,
  [AppEventTypes.PAYMENT_RECEIVED]: handlePaymentReceived,
  [AppEventTypes.VERIFICATION_REQUEST_CREATED]: handleVerificationRequestCreated,
  [AppEventTypes.REPORT_UPLOADED]: handleReportUploaded,
  [AppEventTypes.AGENT_ASSIGNED]: handleAgentAssigned,
  [AppEventTypes.INSPECTION_STARTED]: handleInspectionStarted,
  [AppEventTypes.PAYMENT_FAILED]: handlePaymentFailed,
  [AppEventTypes.SUBSCRIPTION_ENDED]: handleSubscriptionEnded,
  [AppEventTypes.PROPERTY_REQUEST_CREATED]: handlePropertyRequestCreated,
  [AppEventTypes.PROPERTY_REQUEST_UPDATED]: handlePropertyRequestUpdated,
  [AppEventTypes.PROPERTY_PAYMENT_RECEIVED]: handlePropertyPaymentReceived,
  [AppEventTypes.PROPERTY_PAYMENT_FAILED]: handlePropertyPaymentFailed,
  [AppEventTypes.AGENT_CREATED]: handleAgentCreated,
};
