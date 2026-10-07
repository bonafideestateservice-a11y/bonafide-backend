import { Job, UnrecoverableError } from "bullmq";
import { Notification, NotificationStatus, Prisma } from "@prisma/client";
import { AppEventPayloads, PayloadEventType } from "../../events";
import {
  createNotification,
  findNotification,
  isNotificationChannelEnabled,
  updateNotification,
} from "../../api/services/database/notifications";
import { sendNotificationToUser } from "../../libs/firebase/firebase";
import { EmailTemplateNotConfiguredError, sendTemplateEmail } from "../../libs/zeptomail/zeptomail";
import { logger } from "../../utils/logger";
import { notificationEventHandlers } from "./event-handlers";
import { enqueueNotificationDeliveries } from "./queue";
import { NotificationDelivery } from "./types";

type DeliveryResult = { ok: boolean; meta?: Prisma.JsonObject; skipped?: string };

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

export const processNotificationEvent = async (job: Job<AppEventPayloads[PayloadEventType]>) => {
  const handler = notificationEventHandlers[job.name as PayloadEventType];
  if (!handler) {
    throw new UnrecoverableError(`No notification handler for event ${job.name}`);
  }

  const deliveries = await handler(job.data as never);
  await enqueueNotificationDeliveries(job, deliveries);

  logger.info(`[notifications] ${job.name} queued deliveries=${deliveries.length}`, {
    jobId: job.id,
  });
  return { deliveries: deliveries.length };
};

const send = async (
  delivery: NotificationDelivery,
  notification?: Notification,
): Promise<DeliveryResult> => {
  if (delivery.channel === "email") {
    try {
      await sendTemplateEmail({
        to: { email: delivery.recipient.email, name: delivery.recipient.fullName },
        content: delivery.email,
      });
    } catch (error) {
      // Retrying cannot fix a missing template key.
      if (error instanceof EmailTemplateNotConfiguredError) {
        throw new UnrecoverableError(error.message);
      }
      throw error;
    }
    return { ok: true };
  }

  if (!notification) {
    throw new UnrecoverableError("In-app delivery requires a notification record");
  }
  const result = await sendNotificationToUser(notification);
  return {
    ok: result.ok,
    meta: "receipts" in result ? { receipts: result.receipts } : { reason: result.message },
  };
};

/**
 * Sends one delivery. Tracked deliveries respect the recipient's notification
 * settings and record their outcome on a `Notification` row that is reused
 * across retries.
 */
export const processNotificationDelivery = async (
  job: Job<NotificationDelivery>,
): Promise<DeliveryResult> => {
  const delivery = job.data;
  const { recipient, notification: record } = delivery;

  if (!record) {
    await send(delivery);
    logger.info(`[notifications] ${job.name} ${delivery.channel} sent`, { jobId: job.id });
    return { ok: true };
  }

  const setting = delivery.channel === "email" ? "email" : "push";
  const enabled = await isNotificationChannelEnabled(recipient.id, setting);
  // In-app notifications always land in the inbox; the push setting only decides the phone push.
  if (!enabled && delivery.channel === "email") {
    return { ok: true, skipped: "disabled" };
  }

  const existing = delivery.notificationId
    ? await findNotification({ id: delivery.notificationId })
    : null;
  if (existing?.notificationStatus === NotificationStatus.SENT) {
    return { ok: true, skipped: "already-sent" };
  }

  const meta: Prisma.JsonObject = { ...record.meta, channel: delivery.channel };
  const notification =
    existing ??
    (await createNotification({
      ...record,
      userId: recipient.id,
      meta,
      notificationStatus: NotificationStatus.PENDING,
    }));
  if (!existing) {
    await job.updateData({ ...delivery, notificationId: notification.id });
  }

  try {
    const result = enabled
      ? await send(delivery, notification)
      : { ok: true, meta: { push: "disabled" } };
    await updateNotification(
      { id: notification.id },
      {
        notificationStatus: result.ok ? NotificationStatus.SENT : NotificationStatus.FAILED,
        sentAt: result.ok ? new Date() : null,
        meta: { ...meta, ...result.meta },
      },
    );
    return result;
  } catch (error) {
    await updateNotification(
      { id: notification.id },
      {
        notificationStatus: NotificationStatus.FAILED,
        meta: { ...meta, error: errorMessage(error), attempts: job.attemptsMade + 1 },
      },
    );
    throw error;
  }
};
