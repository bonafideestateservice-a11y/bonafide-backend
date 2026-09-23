import { messaging } from "./index";
import {
  createNotification,
  updateNotification,
} from "../../api/authentication/services/database/notifications";
import { getActiveFcmTokensForUser } from "../../api/authentication/services/database/pushToken";
import { NotificationType, NotificationStatus, ServiceType } from "@prisma/client";
import { logger } from "../../utils/logger";
import { CreateNotificationInput } from "../../api/authentication/services/database/notifications";
import { deactivateFcmToken } from "../../api/authentication/services/database/pushToken";

/**
 * Send a notification to a user: Save notification row, retrieve user's tokens and send.
 * Accepts all fields for CreateNotificationInput and UpdateNotificationInput.
 */

// ...existing code...

export async function sendNotificationToUser(
  createInput: CreateNotificationInput,
  updateInput?: Partial<{
    notificationStatus?: NotificationStatus;
    title?: string;
    serviceType?: ServiceType;
    body?: string;
    sentAt?: Date | null;
    meta?: any;
  }>,
) {
  logger.info("sendNotificationToUser called", { createInput, updateInput });

  if (!createInput.userId || !createInput.type) {
    logger.warn("sendNotificationToUser called without userId or type", {
      userId: createInput.userId,
      type: createInput.type,
    });
    return { ok: false, message: "userId and type required" };
  }

  let notification;
  try {
    notification = await createNotification({
      ...createInput,
      notificationStatus: createInput.notificationStatus ?? NotificationStatus.PENDING,
      serviceType: createInput.serviceType ?? "GENERAL",
      sentAt: createInput.sentAt ?? null,
      meta: createInput.meta ?? null,
    });
  } catch (err) {
    logger.error("Failed to create notification record", err);
    return { ok: false, message: "failed to create notification" };
  }

  let tokens: any[] = [];
  try {
    tokens = await getActiveFcmTokensForUser(createInput.userId);
  } catch (err) {
    logger.error("Failed to fetch FCM tokens", err);
    await updateNotification(notification.id, {
      notificationStatus: NotificationStatus.FAILED,
      ...(updateInput || {}),
    });
    return { ok: false, message: "failed to fetch tokens" };
  }

  const fcmTokens = tokens.map((t: any) => t.token).filter(Boolean);

  if (fcmTokens.length === 0) {
    await updateNotification(notification.id, {
      notificationStatus: NotificationStatus.FAILED,
      ...(updateInput || {}),
    });
    return { ok: false, message: "no tokens for user" };
  }

  const receipts: any[] = [];
  for (const fcmToken of fcmTokens) {
    try {
      const messagePayload = {
        token: fcmToken,
        notification: {
          title: createInput.title ?? "",
          body: createInput.body ?? "",
        },
        data: Object.fromEntries(
          Object.entries({
            ...createInput.meta,
            type: createInput.type,
            notificationId: notification.id,
            userId: createInput.userId,
          }).map(([key, value]) => [key, String(value)]), // Convert all values to strings
        ),
      };

      await messaging.send(messagePayload);
    } catch (err: any) {
      logger.error("FCM send error", { fcmToken, error: err });

      // Handle invalid tokens
      if (
        err.code === "messaging/registration-token-not-registered" ||
        err.message.includes("NotRegistered") ||
        err.message.includes("Requested entity was not found")
      ) {
        try {
          await deactivateFcmToken(fcmToken);
          logger.info("Deactivated invalid FCM token", { fcmToken });
        } catch (deactivationError) {
          logger.error("Failed to deactivate FCM token", {
            fcmToken,
            error: deactivationError,
          });
        }
      }

      receipts.push({ token: fcmToken, error: String(err) });
    }
  }

  await updateNotification(notification.id, {
    notificationStatus: receipts.length === 0 ? NotificationStatus.SENT : NotificationStatus.FAILED,
    sentAt: new Date(),
    ...(updateInput || {}),
    meta: { receipts, ...(updateInput?.meta || {}) },
  });

  return {
    ok: receipts.length === 0,
    notificationId: notification.id,
    receipts,
  };
}
// ...existing code...
