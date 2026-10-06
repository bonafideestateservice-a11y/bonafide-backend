import type { NotificationType, Prisma } from "@prisma/client";
import type { NotificationRecipient } from "../../api/services/database/notifications";
import type { EmailContent } from "../../libs/zeptomail/templates";

export type NotificationChannel = "email" | "in_app";

export type DeliveryRecipient = Pick<NotificationRecipient, "id" | "email" | "fullName">;

/** Contents of the `Notification` row recorded for a tracked delivery. */
export interface NotificationRecord {
  type: NotificationType;
  title: string;
  body: string;
  serviceId?: string | null;
  verificationTypeId?: string | null;
  verificationRequestId?: string | null;
  meta?: Prisma.JsonObject;
}

interface DeliveryBase {
  recipient: DeliveryRecipient;
  /** Set by the first attempt so retries update the same `Notification` row. */
  notificationId?: string;
}

/**
 * Email deliveries without a `notification` are transactional (registration,
 * password reset): they are always sent and are not recorded.
 */
export interface EmailDelivery extends DeliveryBase {
  channel: "email";
  email: EmailContent;
  notification?: NotificationRecord;
}

export interface InAppDelivery extends DeliveryBase {
  channel: "in_app";
  notification: NotificationRecord;
}

export type NotificationDelivery = EmailDelivery | InAppDelivery;
