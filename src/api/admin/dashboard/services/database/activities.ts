import { NotificationStatus, NotificationType, Prisma } from "@prisma/client";
import { prismaClient } from "../../../../../utils/prisma";

export interface AdminActivity {
  id: string;
  type: NotificationType;
  channel?: string;
  title: string | null;
  body: string | null;
  clientName?: string;
  agentName?: string;
  createdAt: Date;
  sentAt: Date | null;
  meta: Prisma.JsonValue | null;
}

const getString = (meta: Prisma.JsonValue | null, key: string): string | undefined => {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return undefined;
  const value = meta[key];
  return typeof value === "string" ? value : undefined;
};

export const getAllActivities = async (): Promise<AdminActivity[]> => {
  const notifications = await prismaClient.notification.findMany({
    where: { notificationStatus: NotificationStatus.SENT },
    orderBy: { createdAt: "desc" },
  });

  return notifications.map((notification) => {
    const clientName =
      notification.type === NotificationType.VERIFICATION_REQUEST_CREATED
        ? (getString(notification.meta, "clientName") ??
          getString(notification.meta, "userFullName"))
        : undefined;
    const agentName =
      notification.type === NotificationType.REPORT_UPLOADED ||
      notification.type === NotificationType.AGENT_ASSIGNED
        ? getString(notification.meta, "agentName")
        : undefined;

    return {
      id: notification.id,
      type: notification.type,
      channel: getString(notification.meta, "channel"),
      title: notification.title,
      body: notification.body,
      ...(clientName ? { clientName } : {}),
      ...(agentName ? { agentName } : {}),
      createdAt: notification.createdAt,
      sentAt: notification.sentAt,
      meta: notification.meta,
    };
  });
};
