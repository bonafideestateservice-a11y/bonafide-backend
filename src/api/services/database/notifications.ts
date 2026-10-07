import {
  Notification,
  NotificationSettings,
  NotificationStatus,
  NotificationType,
  Prisma,
  ROLE,
} from "@prisma/client";
import { prismaClient } from "../../../utils/prisma";
import { logger } from "../../../utils/logger";

export interface CreateNotificationData {
  userId: string;
  type: NotificationType;
  serviceId?: string | null;
  verificationTypeId?: string | null;
  verificationRequestId?: string | null;
  notificationStatus?: NotificationStatus;
  title?: string | null;
  body?: string | null;
  meta?: Prisma.JsonValue | null;
  sentAt?: Date | null;
  read?: boolean;
}

export interface UpdateNotificationData {
  userId?: string;
  type?: NotificationType;
  serviceId?: string | null;
  verificationTypeId?: string | null;
  verificationRequestId?: string | null;
  notificationStatus?: NotificationStatus;
  title?: string | null;
  body?: string | null;
  meta?: Prisma.JsonValue | null;
  sentAt?: Date | null;
  read?: boolean;
}

export type CreateNotificationInput = CreateNotificationData;
export type UpdateNotificationInput = UpdateNotificationData;

export interface UpdateNotificationSettingsData {
  email?: boolean;
  sms?: boolean;
  push?: boolean;
}

export const updateNotificationSettings = async (
  userId: string,
  data: UpdateNotificationSettingsData,
): Promise<NotificationSettings | null> => {
  try {
    const user = await prismaClient.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) return null;

    const settings = await prismaClient.notificationSettings.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });

    logger.info(`Notification settings updated userId=${userId}`);
    return settings;
  } catch (error) {
    logger.error(`Error updating notification settings userId=${userId} ${error}`);
    throw error;
  }
};

export type NotificationChannelSetting = "email" | "push";

export const isNotificationChannelEnabled = async (
  userId: string,
  channel: NotificationChannelSetting,
): Promise<boolean> => {
  try {
    const settings = await prismaClient.notificationSettings.findUnique({
      where: { userId },
      select: { email: true, push: true },
    });
    // Users who never saved their settings get email and push.
    return settings?.[channel] ?? true;
  } catch (error) {
    logger.error(`Error reading notification settings userId=${userId} ${error}`);
    throw error;
  }
};

const notificationRecipientSelect = {
  id: true,
  email: true,
  fullName: true,
  phone: true,
} satisfies Prisma.UserSelect;

export type NotificationRecipient = Prisma.UserGetPayload<{
  select: typeof notificationRecipientSelect;
}>;

export const getNotificationRecipient = async (
  userId: string,
): Promise<NotificationRecipient | null> => {
  try {
    return await prismaClient.user.findUnique({
      where: { id: userId },
      select: notificationRecipientSelect,
    });
  } catch (error) {
    logger.error(`Error fetching notification recipient userId=${userId} ${error}`);
    throw error;
  }
};

export const getAdminNotificationRecipients = async (
  excludeUserIds: string[] = [],
): Promise<NotificationRecipient[]> => {
  try {
    return await prismaClient.user.findMany({
      where: { role: ROLE.ADMIN, id: { notIn: excludeUserIds } },
      select: notificationRecipientSelect,
    });
  } catch (error) {
    logger.error(`Error fetching admin notification recipients ${error}`);
    throw error;
  }
};

export const getVerificationRequestNotificationContext = async (verificationRequestId: string) => {
  try {
    return await prismaClient.verificationRequest.findUnique({
      where: { id: verificationRequestId },
      include: {
        user: { select: notificationRecipientSelect },
        verificationType: { include: { service: true } },
        agentAssignment: {
          include: { agent: { include: { user: { select: notificationRecipientSelect } } } },
        },
        // Recurring assignments are deleted once a period is reported, so report emails read
        // the agent from the report itself.
        reports: {
          orderBy: { generatedAt: "desc" },
          take: 5,
          select: { id: true, agent: { select: { name: true } } },
        },
      },
    });
  } catch (error) {
    logger.error(
      `Error fetching notification context verificationRequestId=${verificationRequestId} ${error}`,
    );
    throw error;
  }
};

export type VerificationRequestNotificationContext = NonNullable<
  Awaited<ReturnType<typeof getVerificationRequestNotificationContext>>
>;

export const createNotification = async (data: CreateNotificationData): Promise<Notification> => {
  try {
    const notification = await prismaClient.notification.create({
      data: {
        userId: data.userId,
        type: data.type,
        serviceId: data.serviceId ?? null,
        verificationTypeId: data.verificationTypeId ?? null,
        verificationRequestId: data.verificationRequestId ?? null,
        notificationStatus: data.notificationStatus ?? NotificationStatus.PENDING,
        title: data.title ?? null,
        body: data.body ?? null,
        meta: data.meta == null ? undefined : data.meta,
        sentAt: data.sentAt ?? null,
        read: data.read ?? false,
      },
    });

    logger.info(
      `Notification created successfully notificationId=${notification.id} userId=${notification.userId} type=${notification.type}`,
    );
    return notification;
  } catch (error) {
    logger.error(`Error creating notification ${error}`);
    throw error;
  }
};

export const getAllNotifications = async (): Promise<Notification[]> => {
  try {
    const notifications = await prismaClient.notification.findMany({
      orderBy: { createdAt: "desc" },
    });

    logger.info(`Fetched all notifications count=${notifications.length}`);
    return notifications;
  } catch (error) {
    logger.error(`Error fetching notifications ${error}`);
    throw error;
  }
};

export const getNotificationsByUser = async (userId: string): Promise<Notification[]> => {
  try {
    const notifications = await prismaClient.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    logger.info(`Fetched notifications userId=${userId} count=${notifications.length}`);
    return notifications;
  } catch (error) {
    logger.error(`Error fetching notifications for user ${userId} ${error}`);
    throw error;
  }
};

export const getNotificationsByVerificationRequest = async (
  verificationRequestId: string,
): Promise<Notification[]> => {
  try {
    const notifications = await prismaClient.notification.findMany({
      where: { verificationRequestId },
      orderBy: { createdAt: "desc" },
    });

    logger.info(
      `Fetched notifications verificationRequestId=${verificationRequestId} count=${notifications.length}`,
    );
    return notifications;
  } catch (error) {
    logger.error(
      `Error fetching notifications for verificationRequestId ${verificationRequestId} ${error}`,
    );
    throw error;
  }
};

export const findNotification = async (
  where: Prisma.NotificationWhereUniqueInput,
): Promise<Notification | null> => {
  try {
    const notification = await prismaClient.notification.findUnique({ where });
    logger.info(`Notification lookup found=${!!notification}`);
    return notification;
  } catch (error) {
    logger.error(`Error finding notification ${error}`);
    throw error;
  }
};

export const updateNotification = async (
  where: Prisma.NotificationWhereUniqueInput,
  data: UpdateNotificationData,
): Promise<Notification> => {
  try {
    const updatedNotification = await prismaClient.notification.update({
      where,
      data: {
        userId: data.userId,
        type: data.type,
        serviceId: data.serviceId ?? undefined,
        verificationTypeId: data.verificationTypeId ?? undefined,
        verificationRequestId: data.verificationRequestId ?? undefined,
        notificationStatus: data.notificationStatus,
        title: data.title ?? undefined,
        body: data.body ?? undefined,
        meta: data.meta ?? undefined,
        sentAt: data.sentAt ?? undefined,
        read: data.read,
      },
    });

    logger.info(`Notification updated successfully notificationId=${updatedNotification.id}`);
    return updatedNotification;
  } catch (error) {
    logger.error(`Error updating notification ${error}`);
    throw new Error("Failed to update notification");
  }
};

export const markNotificationAsRead = async (id: string): Promise<Notification> => {
  try {
    const notification = await prismaClient.notification.update({
      where: { id },
      data: { read: true },
    });

    logger.info(`Notification marked as read notificationId=${notification.id}`);
    return notification;
  } catch (error) {
    logger.error(`Error marking notification as read notificationId=${id} ${error}`);
    throw new Error("Failed to mark notification as read");
  }
};

export const deleteNotification = async (
  where: Prisma.NotificationWhereUniqueInput,
): Promise<Notification> => {
  try {
    const deletedNotification = await prismaClient.notification.delete({ where });
    logger.info(`Notification deleted successfully notificationId=${deletedNotification.id}`);
    return deletedNotification;
  } catch (error) {
    logger.error(`Error deleting notification ${error}`);
    throw new Error("Failed to delete notification");
  }
};

const inAppFor = (userId: string): Prisma.NotificationWhereInput => ({
  userId,
  meta: { path: ["channel"], equals: "in_app" },
});

/** A user's in-app inbox (the bell), newest first, plus their unread count. */
export const getInAppNotifications = async (
  userId: string,
  { page, limit, unreadOnly }: { page: number; limit: number; unreadOnly: boolean },
) => {
  const where = { ...inAppFor(userId), ...(unreadOnly ? { read: false } : {}) };
  const [totalItems, unreadCount, data] = await Promise.all([
    prismaClient.notification.count({ where }),
    prismaClient.notification.count({ where: { ...inAppFor(userId), read: false } }),
    prismaClient.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        read: true,
        verificationRequestId: true,
        createdAt: true,
      },
    }),
  ]);
  return { data, unreadCount, meta: { page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) } };
};

/** Mark one (or, without an id, every) in-app notification of the user as read. */
export const markInAppNotificationsRead = (userId: string, id?: string) =>
  prismaClient.notification.updateMany({
    where: { ...inAppFor(userId), ...(id ? { id } : { read: false }) },
    data: { read: true },
  });
