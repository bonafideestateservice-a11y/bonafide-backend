import { prismaClient } from "../../../../../utils/prisma";
import { logger } from "../../../../../utils/logger";

const visible = (id: string) => ({ id, isPublished: true, deletedAt: null });

/** Returns a published property and counts the view; throws P2025 when it isn't visible. */
export const viewProperty = async (id: string) => {
  try {
    return await prismaClient.property.update({
      where: visible(id),
      data: { viewCount: { increment: 1 } },
    });
  } catch (error) {
    logger.error(`Error viewing property propertyId=${id} ${error}`);
    throw error;
  }
};

export const isPropertyVisible = async (id: string) =>
  (await prismaClient.property.count({ where: visible(id) })) > 0;

export const isPropertyFavorite = async (userId: string, propertyId: string) =>
  (await prismaClient.propertyFavorite.count({ where: { userId, propertyId } })) > 0;

export const createPropertyInquiry = (propertyId: string, userId: string, message: string) =>
  prismaClient.propertyInquiry.create({ data: { propertyId, userId, message } });

export const addPropertyFavorite = (userId: string, propertyId: string) =>
  prismaClient.propertyFavorite.upsert({
    where: { userId_propertyId: { userId, propertyId } },
    create: { userId, propertyId },
    update: {},
  });

export const removePropertyFavorite = (userId: string, propertyId: string) =>
  prismaClient.propertyFavorite.deleteMany({ where: { userId, propertyId } });
