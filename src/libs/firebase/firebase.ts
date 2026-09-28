import { getMessaging } from "./index";
import {
  deactivateFcmToken,
  getActiveFcmTokensForUser,
} from "../../api/services/database/fcm-token";
import { Notification } from "@prisma/client";
import { logger } from "../../utils/logger";

/**
 * Send push delivery for a notification record created by an event listener.
 */

// ...existing code...

export async function sendNotificationToUser(notification: Notification) {
  logger.info("sendNotificationToUser called", { notification });

  if (!notification.id || !notification.userId || !notification.type) {
    logger.warn("sendNotificationToUser called without userId or type", {
      notificationId: notification.id,
      userId: notification.userId,
      type: notification.type,
    });
    return { ok: false, message: "userId and type required" };
  }

  const messaging = getMessaging();
  if (!messaging) {
    logger.warn("Firebase Admin is not configured; skipping push delivery");
    return { ok: false, message: "Firebase Admin is not configured" };
  }

  let tokens: any[] = [];
  try {
    tokens = await getActiveFcmTokensForUser(notification.userId);
  } catch (err) {
    logger.error("Failed to fetch FCM tokens", err);
    return { ok: false, message: "failed to fetch tokens" };
  }

  const fcmTokens = tokens.map((t: any) => t.token).filter(Boolean);

  if (fcmTokens.length === 0) {
    return { ok: false, message: "no tokens for user" };
  }

  const receipts: any[] = [];
  for (const fcmToken of fcmTokens) {
    try {
      const messagePayload = {
        token: fcmToken,
        notification: {
          title: notification.title ?? "",
          body: notification.body ?? "",
        },
        data: Object.fromEntries(
          Object.entries({
            ...(notification.meta &&
            typeof notification.meta === "object" &&
            !Array.isArray(notification.meta)
              ? notification.meta
              : {}),
            type: notification.type,
            notificationId: notification.id,
            userId: notification.userId,
          }).map(([key, value]) => [key, String(value)]), // Convert all values to strings
        ),
      };

      await messaging.send(messagePayload);
    } catch (err: any) {
      logger.error("FCM send error", { fcmToken, error: err });
      const errorMessage = err instanceof Error ? err.message : String(err);

      // Handle invalid tokens
      if (
        err.code === "messaging/registration-token-not-registered" ||
        errorMessage.includes("NotRegistered") ||
        errorMessage.includes("Requested entity was not found")
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

  return {
    ok: receipts.length === 0,
    notificationId: notification.id,
    receipts,
  };
}
// ...existing code...
