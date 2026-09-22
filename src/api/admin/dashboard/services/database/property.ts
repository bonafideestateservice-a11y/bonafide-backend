import { Prisma, Property, PropertyStatus } from "@prisma/client";
import { prismaClient } from "../../../../../utils/prisma";
import { logger } from "../../../../../utils/logger";

export interface CreatePropertyData {
  name: string;
  address: string;
  status?: PropertyStatus;
}

export interface UpdatePropertyData {
  name?: string;
  address?: string;
  status?: PropertyStatus;
}

export const createProperty = async (data: CreatePropertyData): Promise<Property> => {
  try {
    const property = await prismaClient.property.create({ data });
    logger.info(`Property created propertyId=${property.id}`);
    return property;
  } catch (error) {
    logger.error(`Error creating property ${error}`);
    throw error;
  }
};

export const getAllProperties = async (): Promise<Property[]> => {
  try {
    const properties = await prismaClient.property.findMany({
      orderBy: { createdAt: "desc" },
    });
    logger.info(`Fetched properties count=${properties.length}`);
    return properties;
  } catch (error) {
    logger.error(`Error fetching properties ${error}`);
    throw error;
  }
};

export const findProperty = async (id: string): Promise<Property | null> => {
  try {
    return await prismaClient.property.findUnique({ where: { id } });
  } catch (error) {
    logger.error(`Error finding property propertyId=${id} ${error}`);
    throw error;
  }
};

export const updateProperty = async (id: string, data: UpdatePropertyData): Promise<Property> => {
  try {
    const property = await prismaClient.property.update({ where: { id }, data });
    logger.info(`Property updated propertyId=${property.id}`);
    return property;
  } catch (error) {
    logger.error(`Error updating property propertyId=${id} ${error}`);
    throw error;
  }
};

export const deleteProperty = async (id: string): Promise<Property> => {
  try {
    const property = await prismaClient.property.delete({ where: { id } });
    logger.info(`Property deleted propertyId=${property.id}`);
    return property;
  } catch (error) {
    logger.error(`Error deleting property propertyId=${id} ${error}`);
    throw error;
  }
};

export const countPropertiesByStatus = async (status: PropertyStatus): Promise<number> => {
  try {
    return await prismaClient.property.count({ where: { status } });
  } catch (error) {
    logger.error(`Error counting properties status=${status} ${error}`);
    throw error;
  }
};

export type PropertyWhereInput = Prisma.PropertyWhereInput;
