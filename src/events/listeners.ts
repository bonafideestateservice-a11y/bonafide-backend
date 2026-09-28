import {
  AgentAssignedPayload,
  appEvents,
  AppEventTypes,
  ForgotPasswordPayload,
  InspectionStartedPayload,
  PaymentReceivedPayload,
  ReportUploadedPayload,
  UserRegisteredPayload,
  VerificationRequestCreatedPayload,
} from "./index";
import { logger } from "../utils/logger";
import { appEventTypeToEmailConfig, clientSendMailWithTemplate } from "../libs/zeptomail";
import { prismaClient } from "../utils/prisma";
import {
  createNotification,
  type CreateNotificationData,
  updateNotification,
} from "../api/services/database/notifications";
import { sendNotificationToUser } from "../libs/firebase/firebase";
import { NotificationStatus, NotificationType, Prisma } from "@prisma/client";

const isJsonObject = (value: Prisma.JsonValue | undefined): value is Prisma.JsonObject =>
  !!value && typeof value === "object" && !Array.isArray(value);

type DeliveryResult = {
  ok: boolean;
  meta?: Prisma.JsonValue;
};

const trackNotification = async (
  data: CreateNotificationData,
  deliver: (
    notification: Awaited<ReturnType<typeof createNotification>>,
  ) => Promise<DeliveryResult>,
) => {
  const notification = await createNotification({
    ...data,
    notificationStatus: NotificationStatus.PENDING,
  });

  try {
    const result = await deliver(notification);
    await updateNotification(
      { id: notification.id },
      {
        notificationStatus: result.ok ? NotificationStatus.SENT : NotificationStatus.FAILED,
        sentAt: result.ok ? new Date() : null,
        meta: {
          ...(isJsonObject(data.meta) ? data.meta : {}),
          ...(isJsonObject(result.meta) ? result.meta : {}),
        },
      },
    );
    return result;
  } catch (error) {
    await updateNotification(
      { id: notification.id },
      {
        notificationStatus: NotificationStatus.FAILED,
        meta: {
          ...(isJsonObject(data.meta) ? data.meta : {}),
          error: error instanceof Error ? error.message : String(error),
        },
      },
    );
    throw error;
  }
};

const getVerificationRequestContext = async (verificationRequestId: string) =>
  prismaClient.verificationRequest.findUnique({
    where: { id: verificationRequestId },
    include: {
      user: true,
      verificationType: { include: { service: true } },
      agentAssignment: { include: { agent: true } },
    },
  });

appEvents.on(AppEventTypes.USER_REGISTERED, async (payload: UserRegisteredPayload) => {
  try {
    const emailTemplate = appEventTypeToEmailConfig[AppEventTypes.USER_REGISTERED];

    if (!emailTemplate) {
      throw new Error("User-registered email template is not configured");
    }

    await clientSendMailWithTemplate({
      mail_template_key: emailTemplate.templateKey,
      email_address: payload.email,
      name: payload.firstName,
      merge_info: emailTemplate.buildMergeInfo({
        firstName: payload.firstName,
      }),
    });

    logger.info(`[event] USER_REGISTERED email sent to ${payload.email}`);
  } catch (error) {
    logger.error("[event] USER_REGISTERED email delivery failed", {
      email: payload.email,
      userId: payload.userId,
      error,
    });
  }
});

appEvents.on(AppEventTypes.PAYMENT_RECEIVED, async (payload: PaymentReceivedPayload) => {
  const emailTemplate = appEventTypeToEmailConfig[AppEventTypes.PAYMENT_RECEIVED];

  await Promise.allSettled([
    trackNotification(
      {
        userId: payload.userId,
        type: NotificationType.PAYMENT_RECEIVED,
        title: "Payment received",
        body: `Your payment of ${payload.amount} ${payload.currency} was received.`,
        verificationRequestId: payload.booking_ref,
        meta: {
          channel: "email",
          reference: payload.reference,
          receiptId: payload.receipt_id,
        },
      },
      async () => {
        if (!emailTemplate) throw new Error("Payment-received email template is not configured");
        await clientSendMailWithTemplate({
          mail_template_key: emailTemplate.templateKey,
          email_address: payload.email,
          name: payload.firstName,
          merge_info: emailTemplate.buildMergeInfo(payload),
        });
        return { ok: true };
      },
    ),
    trackNotification(
      {
        userId: payload.userId,
        type: NotificationType.PAYMENT_RECEIVED,
        title: "Payment received",
        body: `Your payment of ${payload.amount} ${payload.currency} was received.`,
        verificationRequestId: payload.booking_ref,
        meta: {
          channel: "in_app",
          reference: payload.reference,
          receiptId: payload.receipt_id,
        },
      },
      async (notification) => {
        const result = await sendNotificationToUser(notification);
        return {
          ok: result.ok,
          meta: "receipts" in result ? { receipts: result.receipts } : undefined,
        };
      },
    ),
  ]).then((results) => {
    results.forEach((result) => {
      if (result.status === "rejected") {
        logger.error("[event] PAYMENT_RECEIVED notification failed", result.reason);
      }
    });
  });
});

appEvents.on(AppEventTypes.FORGOT_PASSWORD, async (payload: ForgotPasswordPayload) => {
  try {
    const emailTemplate = appEventTypeToEmailConfig[AppEventTypes.FORGOT_PASSWORD];

    if (!emailTemplate) {
      throw new Error("Forgot-password email template is not configured");
    }

    const name = payload.email.split("@")[0];

    await clientSendMailWithTemplate({
      mail_template_key: emailTemplate.templateKey,
      email_address: payload.email,
      name,
      merge_info: emailTemplate.buildMergeInfo({
        firstName: name,
        resetLink: payload.otp,
        otp: payload.otp,
        expiresIn: payload.expiresIn,
      }),
    });

    logger.info(`[event] FORGOT_PASSWORD email sent to ${payload.email}`);
  } catch (error) {
    logger.error("[event] FORGOT_PASSWORD email delivery failed", {
      email: payload.email,
      userId: payload.userId,
      error,
    });
  }
});

appEvents.on(
  AppEventTypes.VERIFICATION_REQUEST_CREATED,
  async (payload: VerificationRequestCreatedPayload) => {
    const context = await getVerificationRequestContext(payload.verificationRequestId);
    if (!context) return;
    const emailTemplate = appEventTypeToEmailConfig[AppEventTypes.VERIFICATION_REQUEST_CREATED];

    await Promise.allSettled([
      trackNotification(
        {
          userId: context.user.id,
          type: NotificationType.VERIFICATION_REQUEST_CREATED,
          title: "Verification request created",
          body: `Your ${context.verificationType.name} verification request was created.`,
          verificationRequestId: context.id,
          verificationTypeId: context.verificationTypeId,
          serviceId: context.verificationType.serviceId,
          meta: {
            channel: "email",
            verificationRequestId: context.id,
            clientName: context.user.fullName,
          },
        },
        async () => {
          if (!emailTemplate)
            throw new Error("Verification-request email template is not configured");
          await clientSendMailWithTemplate({
            mail_template_key: emailTemplate.templateKey,
            email_address: context.user.email,
            name: context.user.fullName,
            merge_info: emailTemplate.buildMergeInfo({
              ...payload,
              firstName: context.user.fullName,
              verificationType: context.verificationType.name,
            }),
          });
          return { ok: true };
        },
      ),
      trackNotification(
        {
          userId: context.user.id,
          type: NotificationType.VERIFICATION_REQUEST_CREATED,
          title: "Verification request created",
          body: `Your ${context.verificationType.name} verification request was created.`,
          verificationRequestId: context.id,
          verificationTypeId: context.verificationTypeId,
          serviceId: context.verificationType.serviceId,
          meta: {
            channel: "in_app",
            verificationRequestId: context.id,
            clientName: context.user.fullName,
          },
        },
        async (notification) => {
          const result = await sendNotificationToUser(notification);
          return {
            ok: result.ok,
            meta: "receipts" in result ? { receipts: result.receipts } : undefined,
          };
        },
      ),
    ]);
  },
);

appEvents.on(AppEventTypes.REPORT_UPLOADED, async (payload: ReportUploadedPayload) => {
  const context = await getVerificationRequestContext(payload.verificationRequestId);
  if (!context) return;
  const emailTemplate = appEventTypeToEmailConfig[AppEventTypes.REPORT_UPLOADED];

  await Promise.allSettled([
    trackNotification(
      {
        userId: context.user.id,
        type: NotificationType.REPORT_UPLOADED,
        title: "Verification report uploaded",
        body: `A report is available for your ${context.verificationType.name} verification.`,
        verificationRequestId: context.id,
        verificationTypeId: context.verificationTypeId,
        serviceId: context.verificationType.serviceId,
        meta: {
          channel: "email",
          reportId: payload.reportId,
          agentName: context.agentAssignment?.agent.name,
        },
      },
      async () => {
        if (!emailTemplate) throw new Error("Report-uploaded email template is not configured");
        await clientSendMailWithTemplate({
          mail_template_key: emailTemplate.templateKey,
          email_address: context.user.email,
          name: context.user.fullName,
          merge_info: emailTemplate.buildMergeInfo({
            ...payload,
            firstName: context.user.fullName,
          }),
        });
        return { ok: true };
      },
    ),
    trackNotification(
      {
        userId: context.user.id,
        type: NotificationType.REPORT_UPLOADED,
        title: "Verification report uploaded",
        body: `A report is available for your ${context.verificationType.name} verification.`,
        verificationRequestId: context.id,
        verificationTypeId: context.verificationTypeId,
        serviceId: context.verificationType.serviceId,
        meta: {
          channel: "in_app",
          reportId: payload.reportId,
          agentName: context.agentAssignment?.agent.name,
        },
      },
      async (notification) => {
        const result = await sendNotificationToUser(notification);
        return {
          ok: result.ok,
          meta: "receipts" in result ? { receipts: result.receipts } : undefined,
        };
      },
    ),
  ]);
});

appEvents.on(AppEventTypes.AGENT_ASSIGNED, async (payload: AgentAssignedPayload) => {
  const context = await getVerificationRequestContext(payload.verificationRequestId);
  if (!context) return;
  const emailTemplate = appEventTypeToEmailConfig[AppEventTypes.AGENT_ASSIGNED];

  await Promise.allSettled([
    trackNotification(
      {
        userId: context.user.id,
        type: NotificationType.AGENT_ASSIGNED,
        title: "Agent assigned",
        body: `An agent has been assigned to your ${context.verificationType.name} verification.`,
        verificationRequestId: context.id,
        verificationTypeId: context.verificationTypeId,
        serviceId: context.verificationType.serviceId,
        meta: {
          channel: "email",
          assignmentId: payload.assignmentId,
          agentId: payload.agentId,
          agentName: context.agentAssignment?.agent.name,
        },
      },
      async () => {
        if (!emailTemplate) throw new Error("Agent-assigned email template is not configured");
        await clientSendMailWithTemplate({
          mail_template_key: emailTemplate.templateKey,
          email_address: context.user.email,
          name: context.user.fullName,
          merge_info: emailTemplate.buildMergeInfo({
            ...payload,
            firstName: context.user.fullName,
          }),
        });
        return { ok: true };
      },
    ),
    trackNotification(
      {
        userId: context.user.id,
        type: NotificationType.AGENT_ASSIGNED,
        title: "Agent assigned",
        body: `An agent has been assigned to your ${context.verificationType.name} verification.`,
        verificationRequestId: context.id,
        verificationTypeId: context.verificationTypeId,
        serviceId: context.verificationType.serviceId,
        meta: {
          channel: "in_app",
          assignmentId: payload.assignmentId,
          agentId: payload.agentId,
          agentName: context.agentAssignment?.agent.name,
        },
      },
      async (notification) => {
        const result = await sendNotificationToUser(notification);
        return {
          ok: result.ok,
          meta: "receipts" in result ? { receipts: result.receipts } : undefined,
        };
      },
    ),
  ]);
});

appEvents.on(AppEventTypes.INSPECTION_STARTED, async (payload: InspectionStartedPayload) => {
  const context = await getVerificationRequestContext(payload.verificationRequestId);
  if (!context) return;
  const emailTemplate = appEventTypeToEmailConfig[AppEventTypes.INSPECTION_STARTED];

  await Promise.allSettled([
    trackNotification(
      {
        userId: context.user.id,
        type: NotificationType.INSPECTION_STARTED,
        title: "Inspection started",
        body: `Inspection has started for your ${context.verificationType.name} verification.`,
        verificationRequestId: context.id,
        verificationTypeId: context.verificationTypeId,
        serviceId: context.verificationType.serviceId,
        meta: { channel: "email", assignmentId: payload.assignmentId, agentId: payload.agentId },
      },
      async () => {
        if (!emailTemplate) throw new Error("Inspection-started email template is not configured");
        await clientSendMailWithTemplate({
          mail_template_key: emailTemplate.templateKey,
          email_address: context.user.email,
          name: context.user.fullName,
          merge_info: emailTemplate.buildMergeInfo({
            ...payload,
            firstName: context.user.fullName,
          }),
        });
        return { ok: true };
      },
    ),
    trackNotification(
      {
        userId: context.user.id,
        type: NotificationType.INSPECTION_STARTED,
        title: "Inspection started",
        body: `Inspection has started for your ${context.verificationType.name} verification.`,
        verificationRequestId: context.id,
        verificationTypeId: context.verificationTypeId,
        serviceId: context.verificationType.serviceId,
        meta: { channel: "in_app", assignmentId: payload.assignmentId, agentId: payload.agentId },
      },
      async (notification) => {
        const result = await sendNotificationToUser(notification);
        return {
          ok: result.ok,
          meta: "receipts" in result ? { receipts: result.receipts } : undefined,
        };
      },
    ),
  ]);
});
