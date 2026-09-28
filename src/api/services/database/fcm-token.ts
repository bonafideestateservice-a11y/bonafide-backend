import { FCMToken, Prisma } from "@prisma/client";
import { prismaClient } from "../../../utils/prisma";
import { logger } from "../../../utils/logger";

export interface CreateFcmTokenData {
  userId?: string | null;
  token: string;
  isActive?: boolean;
  lastSeenAt?: Date;
}

export interface UpdateFcmTokenData {
  userId?: string | null;
  token?: string;
  isActive?: boolean;
  lastSeenAt?: Date;
}

export const createFcmToken = async (data: CreateFcmTokenData): Promise<FCMToken> => {
  try {
    const tokenRecord = await prismaClient.fCMToken.create({
      data: {
        userId: data.userId ?? null,
        token: data.token,
        isActive: data.isActive ?? true,
        lastSeenAt: data.lastSeenAt ?? new Date(),
      },
    });

    logger.info(`FCM token created successfully id=${tokenRecord.id} userId=${tokenRecord.userId}`);
    return tokenRecord;
  } catch (error) {
    logger.error(`Error creating FCM token ${error}`);
    throw error;
  }
};

export const getAllFcmTokens = async (): Promise<FCMToken[]> => {
  try {
    const tokens = await prismaClient.fCMToken.findMany({
      orderBy: { createdAt: "desc" },
    });

    logger.info(`Fetched all FCM tokens count=${tokens.length}`);
    return tokens;
  } catch (error) {
    logger.error(`Error fetching all FCM tokens ${error}`);
    throw error;
  }
};

export const getActiveFcmTokensForUser = async (userId: string): Promise<FCMToken[]> => {
  try {
    const tokens = await prismaClient.fCMToken.findMany({
      where: {
        userId,
        isActive: true,
      },
      orderBy: { lastSeenAt: "desc" },
    });

    logger.info(`Fetched active FCM tokens userId=${userId} count=${tokens.length}`);
    return tokens;
  } catch (error) {
    logger.error(`Error fetching active FCM tokens for user ${userId} ${error}`);
    throw error;
  }
};

export const findFcmToken = async (
  where: Prisma.FCMTokenWhereUniqueInput,
): Promise<FCMToken | null> => {
  try {
    const tokenRecord = await prismaClient.fCMToken.findUnique({ where });
    logger.info(`FCM token lookup found=${!!tokenRecord}`);
    return tokenRecord;
  } catch (error) {
    logger.error(`Error finding FCM token ${error}`);
    throw error;
  }
};

export const findFcmTokenByValue = async (token: string): Promise<FCMToken | null> => {
  try {
    const tokenRecord = await prismaClient.fCMToken.findUnique({
      where: { token },
    });

    logger.info(`FCM token lookup by value found=${!!tokenRecord}`);
    return tokenRecord;
  } catch (error) {
    logger.error(`Error finding FCM token by value ${error}`);
    throw error;
  }
};

export const updateFcmToken = async (
  where: Prisma.FCMTokenWhereUniqueInput,
  data: UpdateFcmTokenData,
): Promise<FCMToken> => {
  try {
    const tokenRecord = await prismaClient.fCMToken.update({
      where,
      data: {
        userId: data.userId ?? undefined,
        token: data.token,
        isActive: data.isActive,
        lastSeenAt: data.lastSeenAt,
      },
    });

    logger.info(`FCM token updated successfully id=${tokenRecord.id}`);
    return tokenRecord;
  } catch (error) {
    logger.error(`Error updating FCM token ${error}`);
    throw new Error("Failed to update FCM token");
  }
};

export const deactivateFcmToken = async (token: string): Promise<FCMToken> => {
  try {
    const tokenRecord = await prismaClient.fCMToken.update({
      where: { token },
      data: {
        isActive: false,
        lastSeenAt: new Date(),
      },
    });

    logger.info(`FCM token deactivated token=${token}`);
    return tokenRecord;
  } catch (error) {
    logger.error(`Error deactivating FCM token ${token} ${error}`);
    throw new Error("Failed to deactivate FCM token");
  }
};

export const deleteFcmToken = async (where: Prisma.FCMTokenWhereUniqueInput): Promise<FCMToken> => {
  try {
    const deletedToken = await prismaClient.fCMToken.delete({ where });
    logger.info(`FCM token deleted successfully id=${deletedToken.id}`);
    return deletedToken;
  } catch (error) {
    logger.error(`Error deleting FCM token ${error}`);
    throw new Error("Failed to delete FCM token");
  }
};
