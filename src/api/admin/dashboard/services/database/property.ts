import { Prisma, Property, PropertyStatus, PropertyType } from "@prisma/client";
import { prismaClient } from "../../../../../utils/prisma";
import { logger } from "../../../../../utils/logger";

export type PropertyListStatus = "all" | "published" | "unpublished";
export type PropertySortBy = "createdAt" | "price";
export type PropertySortOrder = "asc" | "desc";

export interface CreatePropertyData {
  name: string;
  address: string;
  title?: string;
  propertyType?: PropertyType;
  area?: string | null;
  city?: string | null;
  country?: string | null;
  priceAmount?: number;
  priceCurrency?: string;
  viewCount?: number;
  coverImageUrl?: string | null;
  isPublished?: boolean;
  status?: PropertyStatus;
}

export interface UpdatePropertyData {
  name?: string;
  address?: string;
  title?: string;
  propertyType?: PropertyType;
  area?: string | null;
  city?: string | null;
  country?: string | null;
  priceAmount?: number;
  priceCurrency?: string;
  viewCount?: number;
  coverImageUrl?: string | null;
  isPublished?: boolean;
  status?: PropertyStatus;
}

export interface GetPropertiesQuery {
  status?: PropertyListStatus;
  search?: string;
  type?: PropertyType;
  page?: number;
  limit?: number;
  sortBy?: PropertySortBy;
  sortOrder?: PropertySortOrder;
}

const propertySelect = {
  id: true,
  title: true,
  name: true,
  propertyType: true,
  area: true,
  city: true,
  country: true,
  address: true,
  priceAmount: true,
  priceCurrency: true,
  viewCount: true,
  coverImageUrl: true,
  isPublished: true,
  createdAt: true,
} satisfies Prisma.PropertySelect;

export type PropertyListItem = Prisma.PropertyGetPayload<{ select: typeof propertySelect }>;

export interface PropertyListResult {
  data: PropertyListItem[];
  meta: { page: number; limit: number; totalItems: number; totalPages: number };
  counts: { all: number; published: number; unpublished: number };
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

export const getAllProperties = async ({
  status = "all",
  search = "",
  type,
  page = 1,
  limit = 12,
  sortBy = "createdAt",
  sortOrder = "desc",
}: GetPropertiesQuery = {}): Promise<PropertyListResult> => {
  const normalizedSearch = search.trim();
  const baseWhere: Prisma.PropertyWhereInput = {
    ...(type ? { propertyType: type } : {}),
    ...(normalizedSearch
      ? {
          OR: [
            { title: { contains: normalizedSearch, mode: "insensitive" } },
            { name: { contains: normalizedSearch, mode: "insensitive" } },
            { address: { contains: normalizedSearch, mode: "insensitive" } },
            { area: { contains: normalizedSearch, mode: "insensitive" } },
            { city: { contains: normalizedSearch, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const statusWhere: Prisma.PropertyWhereInput =
    status === "published"
      ? { isPublished: true }
      : status === "unpublished"
        ? { isPublished: false }
        : {};
  const where: Prisma.PropertyWhereInput = { AND: [baseWhere, statusWhere] };
  const countWhere = (isPublished?: boolean): Prisma.PropertyWhereInput => ({
    AND: [baseWhere, ...(isPublished === undefined ? [] : [{ isPublished }])],
  });

  try {
    const [totalItems, data, all, published, unpublished] = await Promise.all([
      prismaClient.property.count({ where }),
      prismaClient.property.findMany({
        where,
        orderBy: { [sortBy === "price" ? "priceAmount" : "createdAt"]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
        select: propertySelect,
      }),
      prismaClient.property.count({ where: countWhere() }),
      prismaClient.property.count({ where: countWhere(true) }),
      prismaClient.property.count({ where: countWhere(false) }),
    ]);

    logger.info(`Fetched properties count=${data.length} total=${totalItems}`);
    return {
      data,
      meta: { page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) },
      counts: { all, published, unpublished },
    };
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

export const publishProperty = async (id: string): Promise<Property> => {
  try {
    const currentProperty = await prismaClient.property.findUniqueOrThrow({ where: { id } });
    const isPublished = !currentProperty.isPublished;
    const property = await prismaClient.property.update({ where: { id }, data: { isPublished } });
    logger.info(
      `Property publication updated propertyId=${property.id} isPublished=${isPublished}`,
    );
    return property;
  } catch (error) {
    logger.error(`Error updating property publication propertyId=${id} ${error}`);
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
