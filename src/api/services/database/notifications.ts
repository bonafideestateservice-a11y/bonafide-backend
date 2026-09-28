import { Notification, NotificationStatus, NotificationType, Prisma } from "@prisma/client";
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
